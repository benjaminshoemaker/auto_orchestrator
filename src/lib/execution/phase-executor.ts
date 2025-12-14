/**
 * Phase Executor
 * Executes all tasks in an implementation phase
 */

import type { Task, TaskResult, ImplementationPhase, SpecificationContent } from '../../types/index.js';
import type { StateManager } from '../state/state-manager.js';
import { DependencyResolver } from '../state/dependency-resolver.js';
import { TaskExecutor, type TaskExecutorOptions, type TaskExecutionEvent } from './task-executor.js';
import type { TaskContext } from './prompt-builder.js';
import type { GitWorkflowManager } from '../git/workflow-manager.js';
import * as terminal from '../ui/terminal.js';
import { EventEmitter } from 'events';

export interface PhaseExecutorOptions extends TaskExecutorOptions {
  stopOnFailure?: boolean;
  parallel?: boolean;
  maxParallel?: number;
  gitWorkflow?: GitWorkflowManager;
}

export interface PhaseExecutionEvent {
  type: 'phase_start' | 'phase_complete' | 'phase_fail' | 'task_event';
  phaseNumber: number;
  phaseName: string;
  taskEvent?: TaskExecutionEvent;
  progress?: {
    completed: number;
    total: number;
    failed: number;
  };
}

export interface PhaseExecutionResult {
  phaseNumber: number;
  phaseName: string;
  success: boolean;
  tasksCompleted: number;
  tasksFailed: number;
  tasksSkipped: number;
  totalDuration: number;
  results: TaskResult[];
}

/**
 * Executes all tasks in an implementation phase
 */
export class PhaseExecutor extends EventEmitter {
  private options: Required<Omit<PhaseExecutorOptions, 'gitWorkflow'>> & { gitWorkflow?: GitWorkflowManager };
  private stateManager: StateManager;
  private specification?: SpecificationContent;
  private aborted: boolean = false;

  constructor(
    stateManager: StateManager,
    options: PhaseExecutorOptions = {}
  ) {
    super();
    this.stateManager = stateManager;
    this.options = {
      cliPath: options.cliPath || 'claude',
      timeout: options.timeout || 300000,
      validateResults: options.validateResults ?? true,
      maxRetries: options.maxRetries || 2,
      onProgress: options.onProgress || (() => {}),
      stopOnFailure: options.stopOnFailure ?? true,
      parallel: options.parallel ?? false,
      maxParallel: options.maxParallel || 2,
      gitWorkflow: options.gitWorkflow,
    };
  }

  /**
   * Set specification for context
   */
  setSpecification(spec: SpecificationContent): void {
    this.specification = spec;
  }

  /**
   * Execute a phase
   */
  async execute(phase: ImplementationPhase): Promise<PhaseExecutionResult> {
    this.aborted = false;
    const startTime = Date.now();
    const results: TaskResult[] = [];
    let completed = 0;
    let failed = 0;
    let skipped = 0;

    // Start phase branch if git workflow is enabled
    if (this.options.gitWorkflow) {
      const branchName = await this.options.gitWorkflow.startImplPhase(
        phase.phase_number,
        phase.name
      );
      if (branchName) {
        terminal.printInfo(`Created branch: ${branchName}`);
      }
    }

    this.emitPhaseEvent('phase_start', phase, { completed, total: phase.tasks.length, failed });

    terminal.printHeader(`Phase ${phase.phase_number}: ${phase.name}`);
    terminal.printInfo(`${phase.tasks.length} tasks to execute`);

    // Validate tasks have valid dependency structure
    new DependencyResolver(phase.tasks);

    // Execute tasks in dependency order
    const pendingTasks = [...phase.tasks.filter((t) => t.status === 'pending')];
    const completedIds = new Set(
      phase.tasks.filter((t) => t.status === 'complete').map((t) => t.id)
    );

    // Update progress for already completed tasks
    completed = completedIds.size;

    while (pendingTasks.length > 0 && !this.aborted) {
      // Find tasks that can run (all deps satisfied)
      const readyTasks = pendingTasks.filter(
        (t) => t.depends_on.every((d) => completedIds.has(d))
      );

      if (readyTasks.length === 0 && pendingTasks.length > 0) {
        // No tasks ready but some pending - dependency issue
        terminal.printError('Cannot proceed - no tasks ready (dependency cycle?)');
        break;
      }

      // Execute ready tasks (serially or in parallel)
      if (this.options.parallel && readyTasks.length > 1) {
        const batch = readyTasks.slice(0, this.options.maxParallel);
        const batchResults = await Promise.all(
          batch.map((task) => this.executeTask(phase, task))
        );

        for (let i = 0; i < batch.length; i++) {
          const batchTask = batch[i];
          const result = batchResults[i];
          if (!batchTask || !result) continue;

          results.push(result);

          // Remove from pending
          const idx = pendingTasks.findIndex((t) => t.id === batchTask.id);
          if (idx >= 0) pendingTasks.splice(idx, 1);

          if (result.status === 'complete') {
            completed++;
            completedIds.add(batchTask.id);
          } else {
            failed++;
            if (this.options.stopOnFailure) {
              this.aborted = true;
              break;
            }
          }
        }
      } else {
        // Execute one task at a time
        const task = readyTasks[0];
        if (!task) continue;

        const result = await this.executeTask(phase, task);
        results.push(result);

        // Remove from pending
        const idx = pendingTasks.findIndex((t) => t.id === task.id);
        if (idx >= 0) pendingTasks.splice(idx, 1);

        if (result.status === 'complete') {
          completed++;
          completedIds.add(task.id);
        } else {
          failed++;
          if (this.options.stopOnFailure) {
            break;
          }
        }
      }

      // Update progress
      terminal.printProgress(
        completed,
        phase.tasks.length,
        `${completed}/${phase.tasks.length} tasks`
      );
    }

    // Count skipped tasks
    skipped = pendingTasks.length;

    const success = failed === 0 && skipped === 0;
    const totalDuration = Date.now() - startTime;

    const result: PhaseExecutionResult = {
      phaseNumber: phase.phase_number,
      phaseName: phase.name,
      success,
      tasksCompleted: completed,
      tasksFailed: failed,
      tasksSkipped: skipped,
      totalDuration,
      results,
    };

    if (success) {
      this.emitPhaseEvent('phase_complete', phase, { completed, total: phase.tasks.length, failed });
      terminal.printSuccess(`Phase ${phase.phase_number} complete!`);
    } else {
      this.emitPhaseEvent('phase_fail', phase, { completed, total: phase.tasks.length, failed });
      terminal.printError(
        `Phase ${phase.phase_number} incomplete: ${failed} failed, ${skipped} skipped`
      );
    }

    return result;
  }

  /**
   * Execute a single task within the phase
   */
  private async executeTask(
    phase: ImplementationPhase,
    task: Task
  ): Promise<TaskResult> {
    const context: TaskContext = {
      projectName: this.stateManager.getMeta().project_name,
      phaseName: phase.name,
      phaseNumber: phase.phase_number,
      techStack: this.specification?.tech_stack,
      architecture: this.specification?.architecture,
    };

    const executor = new TaskExecutor(context, {
      cliPath: this.options.cliPath,
      timeout: this.options.timeout,
      validateResults: this.options.validateResults,
      maxRetries: this.options.maxRetries,
      onProgress: this.options.onProgress,
      gitWorkflow: this.options.gitWorkflow,
    });

    // Forward task events
    executor.on('event', (event: TaskExecutionEvent) => {
      this.emit('event', {
        type: 'task_event',
        phaseNumber: phase.phase_number,
        phaseName: phase.name,
        taskEvent: event,
      } as PhaseExecutionEvent);
    });

    const result = await executor.executeWithRetry(task);

    // Update task status in state
    this.stateManager.updateTask(task.id, {
      status: result.status,
      failure_reason:
        result.status === 'failed' ? result.output_summary : undefined,
    });

    // Save result
    this.stateManager.recordTaskResult(result);

    return result;
  }

  /**
   * Abort the current phase execution
   */
  abort(): void {
    this.aborted = true;
  }

  private emitPhaseEvent(
    type: PhaseExecutionEvent['type'],
    phase: ImplementationPhase,
    progress: PhaseExecutionEvent['progress']
  ): void {
    this.emit('event', {
      type,
      phaseNumber: phase.phase_number,
      phaseName: phase.name,
      progress,
    } as PhaseExecutionEvent);
  }
}
