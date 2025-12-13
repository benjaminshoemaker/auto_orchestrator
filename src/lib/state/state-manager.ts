import {
  ProjectDocument,
  ProjectMeta,
  Task,
  TaskResult,
  ImplementationPhase,
  IdeationContent,
  SpecificationContent,
} from '../../types/index.js';
import { StateError } from '../../types/errors.js';
import { DocumentManager } from '../documents.js';
import { logger } from '../../utils/logger.js';

/**
 * Event types emitted by the state manager
 */
export type StateEventType =
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_skipped'
  | 'task_retried'
  | 'phase_completed'
  | 'approval_added'
  | 'cost_updated';

/**
 * State event data
 */
export interface StateEvent {
  type: StateEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Event handler function type
 */
export type StateEventHandler = (event: StateEvent) => void;

/**
 * Centralized state manager coordinating in-memory state with file persistence
 */
export class StateManager {
  private doc: ProjectDocument | null = null;
  private taskResults: Map<string, TaskResult> = new Map();
  private dirty: boolean = false;
  private eventHandlers: Map<StateEventType, StateEventHandler[]> = new Map();

  constructor(
    private documentManager: DocumentManager,
    private projectDir: string
  ) {}

  // =====================================
  // Lifecycle Methods
  // =====================================

  /**
   * Load PROJECT.md and all task results into memory
   */
  async load(): Promise<void> {
    this.doc = await this.documentManager.readProject();

    // Load all task results
    const results = await this.documentManager.getAllTaskResults();
    this.taskResults.clear();
    for (const result of results) {
      this.taskResults.set(result.task_id, result);
    }

    this.dirty = false;
    logger.debug('State loaded from files');
  }

  /**
   * Persist changes if dirty
   */
  async save(): Promise<void> {
    if (!this.dirty || !this.doc) {
      return;
    }

    // Update PROJECT.md timestamp
    this.doc.meta.updated = new Date().toISOString();

    // Update meta first
    await this.documentManager.updateProjectMeta(this.doc.meta);

    // Update all tasks (to persist status changes)
    for (const phase of this.doc.implementation_phases) {
      for (const task of phase.tasks) {
        await this.documentManager.updateTask(task.id, task);
      }
    }

    // Save any task results that need persisting
    for (const result of this.taskResults.values()) {
      await this.documentManager.saveTaskResult(result);
    }

    this.dirty = false;
    logger.debug('State saved to files');
  }

  // =====================================
  // Read State Methods
  // =====================================

  /**
   * Get current project document (throws if not loaded)
   */
  getProject(): ProjectDocument {
    if (!this.doc) {
      throw StateError.invalidState('State not loaded. Call load() first.');
    }
    return this.doc;
  }

  /**
   * Get project meta
   */
  getMeta(): ProjectMeta {
    return this.getProject().meta;
  }

  /**
   * Get current phase number or 'implementation'
   */
  getCurrentPhase(): number | 'implementation' {
    return this.getMeta().current_phase;
  }

  /**
   * Get current implementation phase or null if not in implementation
   */
  getCurrentImplPhase(): ImplementationPhase | null {
    const doc = this.getProject();
    if (doc.meta.current_phase !== 'implementation') {
      return null;
    }

    const impl = doc.meta.implementation;
    if (!impl) {
      return doc.implementation_phases[0] || null;
    }

    return doc.implementation_phases[impl.current_impl_phase - 1] || null;
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): Task | null {
    const doc = this.getProject();
    for (const phase of doc.implementation_phases) {
      const task = phase.tasks.find((t) => t.id === taskId);
      if (task) {
        return task;
      }
    }
    return null;
  }

  /**
   * Get a task result by ID
   */
  getTaskResult(taskId: string): TaskResult | null {
    return this.taskResults.get(taskId) || null;
  }

  /**
   * Get all tasks from all implementation phases
   */
  getAllTasks(): Task[] {
    const doc = this.getProject();
    return doc.implementation_phases.flatMap((phase) => phase.tasks);
  }

  // =====================================
  // State Query Methods
  // =====================================

  /**
   * Get next pending task that can run (all deps complete)
   */
  getNextTask(): Task | null {
    const doc = this.getProject();
    if (doc.meta.current_phase !== 'implementation') {
      return null;
    }

    const currentPhase = this.getCurrentImplPhase();
    if (!currentPhase) {
      return null;
    }

    for (const task of currentPhase.tasks) {
      if (task.status === 'pending' && this.areAllDependenciesComplete(task.id)) {
        return task;
      }
    }

    return null;
  }

  /**
   * Get all pending tasks
   */
  getPendingTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === 'pending');
  }

  /**
   * Get all completed tasks
   */
  getCompletedTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === 'complete');
  }

  /**
   * Get all failed tasks
   */
  getFailedTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === 'failed');
  }

  /**
   * Check if a task is complete
   */
  isTaskComplete(taskId: string): boolean {
    const task = this.getTask(taskId);
    return task?.status === 'complete' || task?.status === 'skipped';
  }

  /**
   * Check if all dependencies for a task are complete
   */
  areAllDependenciesComplete(taskId: string): boolean {
    const task = this.getTask(taskId);
    if (!task) {
      return false;
    }

    for (const depId of task.depends_on) {
      if (!this.isTaskComplete(depId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if current phase is complete
   */
  isCurrentPhaseComplete(): boolean {
    const doc = this.getProject();
    const phase = doc.meta.current_phase;

    if (phase === 1) {
      return doc.meta.gates.ideation_complete;
    } else if (phase === 2) {
      return doc.meta.gates.spec_complete;
    } else if (phase === 3) {
      return doc.meta.gates.planning_complete;
    } else if (phase === 'implementation') {
      const implPhase = this.getCurrentImplPhase();
      if (!implPhase) {
        return false;
      }
      return implPhase.tasks.every(
        (t) => t.status === 'complete' || t.status === 'skipped'
      );
    }

    return false;
  }

  // =====================================
  // State Mutation Methods
  // =====================================

  /**
   * Mark task as in progress
   */
  startTask(taskId: string): void {
    const task = this.getTask(taskId);
    if (!task) {
      throw StateError.taskNotFound(taskId);
    }

    task.status = 'in_progress';
    task.started_at = new Date().toISOString();

    this.dirty = true;
    this.emit('task_started', { taskId, task });
    logger.debug(`Started task ${taskId}`);
  }

  /**
   * Mark task as complete and store result
   */
  completeTask(taskId: string, result: TaskResult): void {
    const task = this.getTask(taskId);
    if (!task) {
      throw StateError.taskNotFound(taskId);
    }

    task.status = 'complete';
    task.completed_at = result.completed_at;
    task.duration_seconds = result.duration_seconds;
    task.cost_usd = result.cost_usd;
    task.commit_hash = result.commit_hash;

    this.taskResults.set(taskId, result);
    this.addCost(result.tokens_used, result.cost_usd);

    this.dirty = true;
    this.emit('task_completed', { taskId, result });
    logger.debug(`Completed task ${taskId}`);

    // Check if phase is now complete
    if (this.isCurrentPhaseComplete()) {
      this.emit('phase_completed', { phase: this.getCurrentImplPhase()?.name });
    }
  }

  /**
   * Mark task as failed and store result
   */
  failTask(taskId: string, result: TaskResult): void {
    const task = this.getTask(taskId);
    if (!task) {
      throw StateError.taskNotFound(taskId);
    }

    task.status = 'failed';
    task.completed_at = result.completed_at;
    task.duration_seconds = result.duration_seconds;
    task.failure_reason = result.failure_reason;

    this.taskResults.set(taskId, result);
    this.addCost(result.tokens_used, result.cost_usd);

    this.dirty = true;
    this.emit('task_failed', { taskId, result });
    logger.debug(`Failed task ${taskId}: ${result.failure_reason}`);
  }

  /**
   * Mark task as skipped
   */
  skipTask(taskId: string, reason: string): void {
    const task = this.getTask(taskId);
    if (!task) {
      throw StateError.taskNotFound(taskId);
    }

    task.status = 'skipped';
    task.failure_reason = reason;

    this.dirty = true;
    this.emit('task_skipped', { taskId, reason });
    logger.debug(`Skipped task ${taskId}: ${reason}`);
  }

  /**
   * Reset task to pending for retry
   */
  retryTask(taskId: string): void {
    const task = this.getTask(taskId);
    if (!task) {
      throw StateError.taskNotFound(taskId);
    }

    if (task.status !== 'failed') {
      throw StateError.invalidState(`Cannot retry task ${taskId}: not in failed state`);
    }

    // Reset task
    task.status = 'pending';
    task.started_at = undefined;
    task.completed_at = undefined;
    task.duration_seconds = undefined;
    task.failure_reason = undefined;
    task.commit_hash = undefined;

    // Remove task result
    this.taskResults.delete(taskId);

    this.dirty = true;
    this.emit('task_retried', { taskId });
    logger.debug(`Reset task ${taskId} for retry`);
  }

  /**
   * Add approval for a phase
   */
  approvePhase(phase: string, notes?: string): void {
    const doc = this.getProject();
    const now = new Date().toISOString();

    // Update approval
    const existing = doc.approvals.find((a) => a.phase === phase);
    if (existing) {
      existing.status = 'approved';
      existing.approved_at = now;
      if (notes) {
        existing.notes = notes;
      }
    } else {
      doc.approvals.push({
        phase,
        status: 'approved',
        approved_at: now,
        notes,
      });
    }

    // Update gates based on phase
    if (phase === 'Phase 1' || phase === 'phase-1') {
      doc.meta.gates.ideation_approved = true;
      doc.meta.gates.ideation_approved_at = now;
    } else if (phase === 'Phase 2' || phase === 'phase-2') {
      doc.meta.gates.spec_approved = true;
      doc.meta.gates.spec_approved_at = now;
    } else if (phase === 'Phase 3' || phase === 'phase-3') {
      doc.meta.gates.planning_approved = true;
      doc.meta.gates.planning_approved_at = now;
    }

    this.dirty = true;
    this.emit('approval_added', { phase, notes });
    logger.debug(`Approved ${phase}`);
  }

  /**
   * Set ideation content
   */
  setIdeationContent(content: IdeationContent): void {
    const doc = this.getProject();
    doc.ideation = content;
    doc.meta.gates.ideation_complete = true;
    this.dirty = true;
    logger.debug('Set ideation content');
  }

  /**
   * Set specification content
   */
  setSpecificationContent(content: SpecificationContent): void {
    const doc = this.getProject();
    doc.specification = content;
    doc.meta.gates.spec_complete = true;
    this.dirty = true;
    logger.debug('Set specification content');
  }

  /**
   * Add implementation phases
   */
  addImplementationPhases(phases: ImplementationPhase[]): void {
    const doc = this.getProject();
    doc.implementation_phases.push(...phases);
    doc.meta.gates.planning_complete = true;

    // Update implementation progress
    doc.meta.implementation = {
      total_phases: doc.implementation_phases.length,
      completed_phases: 0,
      current_impl_phase: 1,
      current_impl_phase_name: doc.implementation_phases[0]?.name || '',
    };

    this.dirty = true;
    logger.debug(`Added ${phases.length} implementation phases`);
  }

  // =====================================
  // Cost Tracking Methods
  // =====================================

  /**
   * Add cost to totals
   */
  addCost(tokens: number, costUsd: number): void {
    const doc = this.getProject();
    doc.meta.cost.total_tokens += tokens;
    doc.meta.cost.total_cost_usd += costUsd;

    this.dirty = true;
    this.emit('cost_updated', {
      tokens: doc.meta.cost.total_tokens,
      cost: doc.meta.cost.total_cost_usd,
    });
  }

  /**
   * Get total cost
   */
  getTotalCost(): { tokens: number; cost: number } {
    const doc = this.getProject();
    return {
      tokens: doc.meta.cost.total_tokens,
      cost: doc.meta.cost.total_cost_usd,
    };
  }

  // =====================================
  // Event Methods
  // =====================================

  /**
   * Register an event handler
   */
  on(event: StateEventType, handler: StateEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /**
   * Remove an event handler
   */
  off(event: StateEventType, handler: StateEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit an event
   */
  private emit(type: StateEventType, data: Record<string, unknown>): void {
    const event: StateEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    const handlers = this.eventHandlers.get(type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.warn(`Event handler error: ${(error as Error).message}`);
      }
    }
  }
}
