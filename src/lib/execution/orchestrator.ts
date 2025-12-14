/**
 * Execution Orchestrator
 * Coordinates the execution of all implementation phases
 */

import type { ImplementationPhase, TaskResult } from '../../types/index.js';
import type { StateManager } from '../state/state-manager.js';
import type { DocumentManager } from '../documents.js';
import {
  PhaseExecutor,
  type PhaseExecutorOptions,
  type PhaseExecutionEvent,
  type PhaseExecutionResult,
} from './phase-executor.js';
import * as terminal from '../ui/terminal.js';
import { EventEmitter } from 'events';

export interface OrchestratorOptions extends PhaseExecutorOptions {
  dryRun?: boolean;
  startPhase?: number;
  endPhase?: number;
  confirmBeforePhase?: boolean;
}

export interface OrchestratorEvent {
  type: 'orchestration_start' | 'orchestration_complete' | 'orchestration_fail' | 'phase_event';
  phaseEvent?: PhaseExecutionEvent;
  progress?: {
    currentPhase: number;
    totalPhases: number;
    phasesCompleted: number;
  };
}

export interface OrchestratorResult {
  success: boolean;
  phasesCompleted: number;
  phasesFailed: number;
  totalTasks: number;
  tasksCompleted: number;
  tasksFailed: number;
  totalDuration: number;
  phaseResults: PhaseExecutionResult[];
}

/**
 * Orchestrates the execution of all implementation phases
 */
export class Orchestrator extends EventEmitter {
  private options: Required<OrchestratorOptions>;
  private stateManager: StateManager;
  private documentManager: DocumentManager;
  private aborted: boolean = false;

  constructor(
    stateManager: StateManager,
    documentManager: DocumentManager,
    options: OrchestratorOptions = {}
  ) {
    super();
    this.stateManager = stateManager;
    this.documentManager = documentManager;
    this.options = {
      cliPath: options.cliPath || 'claude',
      timeout: options.timeout || 300000,
      validateResults: options.validateResults ?? true,
      maxRetries: options.maxRetries || 2,
      onProgress: options.onProgress || (() => {}),
      stopOnFailure: options.stopOnFailure ?? true,
      parallel: options.parallel ?? false,
      maxParallel: options.maxParallel || 2,
      dryRun: options.dryRun ?? false,
      startPhase: options.startPhase || 1,
      endPhase: options.endPhase || Infinity,
      confirmBeforePhase: options.confirmBeforePhase ?? false,
    };
  }

  /**
   * Execute all implementation phases
   */
  async execute(): Promise<OrchestratorResult> {
    this.aborted = false;
    const startTime = Date.now();
    const phaseResults: PhaseExecutionResult[] = [];

    const doc = this.stateManager.getProject();
    const phases = doc.implementation_phases.filter(
      (p) => p.phase_number >= this.options.startPhase && p.phase_number <= this.options.endPhase
    );

    if (phases.length === 0) {
      terminal.printWarning('No phases to execute');
      return {
        success: true,
        phasesCompleted: 0,
        phasesFailed: 0,
        totalTasks: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        totalDuration: 0,
        phaseResults: [],
      };
    }

    this.emitOrchestratorEvent('orchestration_start', {
      currentPhase: phases[0].phase_number,
      totalPhases: phases.length,
      phasesCompleted: 0,
    });

    terminal.printHeader('Implementation Execution');
    terminal.printInfo(`Executing ${phases.length} phase(s)`);

    if (this.options.dryRun) {
      terminal.printWarning('DRY RUN - no changes will be made');
    }

    const phaseExecutor = new PhaseExecutor(this.stateManager, {
      cliPath: this.options.cliPath,
      timeout: this.options.timeout,
      validateResults: this.options.validateResults,
      maxRetries: this.options.maxRetries,
      onProgress: this.options.onProgress,
      stopOnFailure: this.options.stopOnFailure,
      parallel: this.options.parallel,
      maxParallel: this.options.maxParallel,
    });

    // Set specification context
    if (doc.specification) {
      phaseExecutor.setSpecification(doc.specification);
    }

    // Forward phase events
    phaseExecutor.on('event', (event: PhaseExecutionEvent) => {
      this.emit('event', {
        type: 'phase_event',
        phaseEvent: event,
      } as OrchestratorEvent);
    });

    let phasesCompleted = 0;
    let phasesFailed = 0;

    for (const phase of phases) {
      if (this.aborted) {
        terminal.printWarning('Execution aborted');
        break;
      }

      // Confirm before phase if configured
      if (this.options.confirmBeforePhase) {
        const confirmed = await terminal.confirm(
          `Execute phase ${phase.phase_number}: ${phase.name}?`,
          true
        );
        if (!confirmed) {
          terminal.printInfo(`Skipping phase ${phase.phase_number}`);
          continue;
        }
      }

      // Dry run - just show what would be done
      if (this.options.dryRun) {
        terminal.printInfo(
          `[DRY RUN] Would execute phase ${phase.phase_number}: ${phase.name} (${phase.tasks.length} tasks)`
        );
        phasesCompleted++;
        continue;
      }

      // Execute the phase
      const result = await phaseExecutor.execute(phase);
      phaseResults.push(result);

      if (result.success) {
        phasesCompleted++;

        // Request approval for the phase
        this.stateManager.approvePhase(`impl-${phase.phase_number}`);
        await this.stateManager.save();

        terminal.printSuccess(
          `Phase ${phase.phase_number} complete! (${result.tasksCompleted} tasks)`
        );
      } else {
        phasesFailed++;

        if (this.options.stopOnFailure) {
          terminal.printError(
            `Phase ${phase.phase_number} failed. Stopping execution.`
          );
          break;
        }
      }

      this.emitOrchestratorEvent('phase_event', {
        currentPhase: phase.phase_number,
        totalPhases: phases.length,
        phasesCompleted,
      });
    }

    const totalDuration = Date.now() - startTime;
    const success = phasesFailed === 0;

    const totalTasks = phaseResults.reduce(
      (sum, r) => sum + r.tasksCompleted + r.tasksFailed + r.tasksSkipped,
      0
    );
    const tasksCompleted = phaseResults.reduce((sum, r) => sum + r.tasksCompleted, 0);
    const tasksFailed = phaseResults.reduce((sum, r) => sum + r.tasksFailed, 0);

    const result: OrchestratorResult = {
      success,
      phasesCompleted,
      phasesFailed,
      totalTasks,
      tasksCompleted,
      tasksFailed,
      totalDuration,
      phaseResults,
    };

    if (success) {
      this.emitOrchestratorEvent('orchestration_complete', {
        currentPhase: phases[phases.length - 1].phase_number,
        totalPhases: phases.length,
        phasesCompleted,
      });

      terminal.printSuccess('Implementation complete!');
      terminal.printInfo(`Duration: ${terminal.formatDuration(totalDuration / 1000)}`);
    } else {
      this.emitOrchestratorEvent('orchestration_fail', {
        currentPhase: phases[phasesCompleted]?.phase_number || 0,
        totalPhases: phases.length,
        phasesCompleted,
      });

      terminal.printError(`Implementation incomplete: ${phasesFailed} phase(s) failed`);
    }

    return result;
  }

  /**
   * Resume execution from last state
   */
  async resume(): Promise<OrchestratorResult> {
    const meta = this.stateManager.getMeta();

    // Find the current implementation phase
    const currentPhase = meta.implementation?.current_impl_phase || 1;

    this.options.startPhase = currentPhase;
    return this.execute();
  }

  /**
   * Abort the current execution
   */
  abort(): void {
    this.aborted = true;
  }

  private emitOrchestratorEvent(
    type: OrchestratorEvent['type'],
    progress: OrchestratorEvent['progress']
  ): void {
    this.emit('event', { type, progress } as OrchestratorEvent);
  }
}
