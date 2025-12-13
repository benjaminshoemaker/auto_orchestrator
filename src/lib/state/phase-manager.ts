import { StateManager } from './state-manager.js';
import { DependencyResolver } from './dependency-resolver.js';
import { logger } from '../../utils/logger.js';

/**
 * Readiness checklist item
 */
export interface ReadinessItem {
  item: string;
  complete: boolean;
  required: boolean;
}

/**
 * Result of readiness check
 */
export interface ReadinessResult {
  ready: boolean;
  checklist: ReadinessItem[];
  blockers: string[];
}

/**
 * Information about a phase
 */
export interface PhaseInfo {
  phase: number | 'implementation';
  name: string;
  status: 'not_started' | 'in_progress' | 'complete' | 'approved';
}

/**
 * Manager for phase transitions and readiness checks
 */
export class PhaseManager {
  constructor(private state: StateManager) {}

  /**
   * Get current phase info
   */
  getCurrentPhase(): PhaseInfo {
    const meta = this.state.getMeta();
    const phase = meta.current_phase;

    return {
      phase,
      name: meta.current_phase_name,
      status: this.getPhaseStatus(phase),
    };
  }

  /**
   * Get phase status
   */
  getPhaseStatus(phase: number | 'implementation'): PhaseInfo['status'] {
    const meta = this.state.getMeta();
    const gates = meta.gates;

    if (phase === 1) {
      if (gates.ideation_approved) return 'approved';
      if (gates.ideation_complete) return 'complete';
      if (meta.current_phase === 1 && meta.phase_status !== 'pending') return 'in_progress';
      return 'not_started';
    }

    if (phase === 2) {
      if (gates.spec_approved) return 'approved';
      if (gates.spec_complete) return 'complete';
      if (meta.current_phase === 2 && meta.phase_status !== 'pending') return 'in_progress';
      return 'not_started';
    }

    if (phase === 3) {
      if (gates.planning_approved) return 'approved';
      if (gates.planning_complete) return 'complete';
      if (meta.current_phase === 3 && meta.phase_status !== 'pending') return 'in_progress';
      return 'not_started';
    }

    if (phase === 'implementation') {
      const implPhase = this.state.getCurrentImplPhase();
      if (!implPhase) return 'not_started';

      const allTasksDone = implPhase.tasks.every(
        (t) => t.status === 'complete' || t.status === 'skipped'
      );

      // Check if this impl phase has been approved
      const approval = this.state
        .getProject()
        .approvals.find((a) => a.phase === `impl-${implPhase.phase_number}`);

      if (approval?.status === 'approved') return 'approved';
      if (allTasksDone) return 'complete';
      if (implPhase.tasks.some((t) => t.status !== 'pending')) return 'in_progress';
      return 'not_started';
    }

    return 'not_started';
  }

  /**
   * Check if phase is complete
   */
  isPhaseComplete(phase: number | 'implementation'): boolean {
    const status = this.getPhaseStatus(phase);
    return status === 'complete' || status === 'approved';
  }

  /**
   * Check if phase is approved
   */
  isPhaseApproved(phase: number | 'implementation'): boolean {
    return this.getPhaseStatus(phase) === 'approved';
  }

  /**
   * Get readiness checklist for approval
   */
  getReadinessForApproval(phase: number | string): ReadinessResult {
    // Convert string like "phase-1" to number
    let phaseNum: number | 'implementation';
    if (typeof phase === 'string') {
      if (phase.startsWith('Phase ')) {
        phaseNum = parseInt(phase.slice(6), 10);
      } else if (phase.startsWith('phase-')) {
        phaseNum = parseInt(phase.slice(6), 10);
      } else if (phase.startsWith('impl-')) {
        phaseNum = 'implementation';
      } else {
        phaseNum = parseInt(phase, 10) || 'implementation';
      }
    } else {
      phaseNum = phase;
    }

    if (phaseNum === 1) {
      return this.getIdeationReadiness();
    } else if (phaseNum === 2) {
      return this.getSpecificationReadiness();
    } else if (phaseNum === 3) {
      return this.getPlanningReadiness();
    } else if (phaseNum === 'implementation') {
      return this.getImplementationReadiness();
    }

    return {
      ready: false,
      checklist: [],
      blockers: ['Unknown phase'],
    };
  }

  /**
   * Check if can proceed to next phase
   */
  canProceedToNextPhase(): { canProceed: boolean; reason?: string } {
    const current = this.getCurrentPhase();

    // Must be approved to proceed
    if (!this.isPhaseApproved(current.phase)) {
      return {
        canProceed: false,
        reason: `${current.name} must be approved before proceeding`,
      };
    }

    // Check if there's a next phase
    if (current.phase === 1) {
      return { canProceed: true };
    } else if (current.phase === 2) {
      return { canProceed: true };
    } else if (current.phase === 3) {
      // Check that we have implementation phases defined
      const project = this.state.getProject();
      if (project.implementation_phases.length === 0) {
        return {
          canProceed: false,
          reason: 'No implementation phases defined',
        };
      }
      return { canProceed: true };
    } else if (current.phase === 'implementation') {
      // Check if there's a next implementation phase
      const implPhase = this.state.getCurrentImplPhase();
      const project = this.state.getProject();

      if (!implPhase) {
        return { canProceed: false, reason: 'No current implementation phase' };
      }

      if (implPhase.phase_number >= project.implementation_phases.length) {
        return { canProceed: false, reason: 'All implementation phases complete' };
      }

      return { canProceed: true };
    }

    return { canProceed: false, reason: 'Unknown phase' };
  }

  /**
   * Transition to next phase
   */
  async proceedToNextPhase(): Promise<void> {
    const { canProceed, reason } = this.canProceedToNextPhase();
    if (!canProceed) {
      throw new Error(`Cannot proceed to next phase: ${reason}`);
    }

    const current = this.getCurrentPhase();
    const project = this.state.getProject();

    if (current.phase === 1) {
      project.meta.current_phase = 2;
      project.meta.current_phase_name = 'Specification';
      project.meta.phase_status = 'pending';
    } else if (current.phase === 2) {
      project.meta.current_phase = 3;
      project.meta.current_phase_name = 'Implementation Planning';
      project.meta.phase_status = 'pending';
    } else if (current.phase === 3) {
      project.meta.current_phase = 'implementation';
      project.meta.current_phase_name = 'Implementation';
      project.meta.phase_status = 'in_progress';
      project.meta.implementation = {
        total_phases: project.implementation_phases.length,
        completed_phases: 0,
        current_impl_phase: 1,
        current_impl_phase_name: project.implementation_phases[0]?.name || '',
      };
    } else if (current.phase === 'implementation') {
      this.advanceImplPhase();
      return;
    }

    await this.state.save();
    logger.debug(`Transitioned to ${project.meta.current_phase_name}`);
  }

  /**
   * Get current implementation phase number (1-indexed)
   */
  getCurrentImplPhaseNumber(): number | null {
    const meta = this.state.getMeta();
    if (meta.current_phase !== 'implementation') {
      return null;
    }
    return meta.implementation?.current_impl_phase || 1;
  }

  /**
   * Check if current implementation phase is complete
   */
  isCurrentImplPhaseComplete(): boolean {
    const implPhase = this.state.getCurrentImplPhase();
    if (!implPhase) {
      return false;
    }

    // Check for failed tasks - blocks completion
    const hasFailed = implPhase.tasks.some((t) => t.status === 'failed');
    if (hasFailed) {
      return false;
    }

    // All tasks must be complete or skipped
    return implPhase.tasks.every(
      (t) => t.status === 'complete' || t.status === 'skipped'
    );
  }

  /**
   * Advance to next implementation phase
   */
  advanceImplPhase(): void {
    const project = this.state.getProject();
    const impl = project.meta.implementation;

    if (!impl) {
      throw new Error('Not in implementation phase');
    }

    const nextPhaseNum = impl.current_impl_phase + 1;
    if (nextPhaseNum > project.implementation_phases.length) {
      throw new Error('No more implementation phases');
    }

    impl.current_impl_phase = nextPhaseNum;
    impl.current_impl_phase_name =
      project.implementation_phases[nextPhaseNum - 1]?.name || '';
    impl.completed_phases++;

    logger.debug(`Advanced to implementation phase ${nextPhaseNum}`);
  }

  // =====================================
  // Private Readiness Methods
  // =====================================

  private getIdeationReadiness(): ReadinessResult {
    const project = this.state.getProject();
    const ideation = project.ideation;
    const checklist: ReadinessItem[] = [];
    const blockers: string[] = [];

    // Problem statement
    const hasProblem = !!ideation?.problem_statement;
    checklist.push({
      item: 'Problem statement defined',
      complete: hasProblem,
      required: true,
    });
    if (!hasProblem) blockers.push('Problem statement not defined');

    // Target users
    const hasUsers = !!ideation?.target_users;
    checklist.push({
      item: 'Target users identified',
      complete: hasUsers,
      required: true,
    });
    if (!hasUsers) blockers.push('Target users not identified');

    // Use cases (at least 3)
    const useCaseCount = ideation?.use_cases.length || 0;
    const hasUseCases = useCaseCount >= 3;
    checklist.push({
      item: 'At least 3 use cases defined',
      complete: hasUseCases,
      required: true,
    });
    if (!hasUseCases) blockers.push(`Only ${useCaseCount} use cases (need at least 3)`);

    // Success criteria
    const hasSuccessCriteria = (ideation?.success_criteria.length || 0) > 0;
    checklist.push({
      item: 'Success criteria defined',
      complete: hasSuccessCriteria,
      required: true,
    });
    if (!hasSuccessCriteria) blockers.push('Success criteria not defined');

    // Constraints
    const hasConstraints =
      (ideation?.constraints.must_have.length || 0) > 0 ||
      (ideation?.constraints.nice_to_have.length || 0) > 0 ||
      (ideation?.constraints.out_of_scope.length || 0) > 0;
    checklist.push({
      item: 'Constraints defined',
      complete: hasConstraints,
      required: false,
    });

    return {
      ready: blockers.length === 0,
      checklist,
      blockers,
    };
  }

  private getSpecificationReadiness(): ReadinessResult {
    const project = this.state.getProject();
    const spec = project.specification;
    const checklist: ReadinessItem[] = [];
    const blockers: string[] = [];

    // Architecture
    const hasArch = !!spec?.architecture;
    checklist.push({
      item: 'Architecture defined',
      complete: hasArch,
      required: true,
    });
    if (!hasArch) blockers.push('Architecture not defined');

    // Tech stack
    const hasTech = (spec?.tech_stack.length || 0) > 0;
    checklist.push({
      item: 'Tech stack selected',
      complete: hasTech,
      required: true,
    });
    if (!hasTech) blockers.push('Tech stack not selected');

    // Data models
    const hasModels = !!spec?.data_models;
    checklist.push({
      item: 'Data models defined',
      complete: hasModels,
      required: true,
    });
    if (!hasModels) blockers.push('Data models not defined');

    // API contracts
    const hasApi = !!spec?.api_contracts;
    checklist.push({
      item: 'API contracts defined',
      complete: hasApi,
      required: false,
    });

    return {
      ready: blockers.length === 0,
      checklist,
      blockers,
    };
  }

  private getPlanningReadiness(): ReadinessResult {
    const project = this.state.getProject();
    const phases = project.implementation_phases;
    const checklist: ReadinessItem[] = [];
    const blockers: string[] = [];

    // At least one implementation phase
    const hasPhases = phases.length > 0;
    checklist.push({
      item: 'At least one implementation phase',
      complete: hasPhases,
      required: true,
    });
    if (!hasPhases) blockers.push('No implementation phases defined');

    // All phases have tasks
    const allPhasesHaveTasks = phases.every((p) => p.tasks.length > 0);
    checklist.push({
      item: 'All phases have tasks',
      complete: allPhasesHaveTasks,
      required: true,
    });
    if (!allPhasesHaveTasks) {
      const emptyPhases = phases.filter((p) => p.tasks.length === 0);
      blockers.push(`Phase(s) without tasks: ${emptyPhases.map((p) => p.name).join(', ')}`);
    }

    // All tasks have acceptance criteria
    const allTasks = phases.flatMap((p) => p.tasks);
    const allTasksHaveCriteria = allTasks.every((t) => t.acceptance_criteria.length > 0);
    checklist.push({
      item: 'All tasks have acceptance criteria',
      complete: allTasksHaveCriteria,
      required: false,
    });

    // No dependency issues
    const resolver = new DependencyResolver(allTasks);
    const validation = resolver.validate();
    checklist.push({
      item: 'No dependency issues',
      complete: validation.valid,
      required: true,
    });
    if (!validation.valid) {
      for (const issue of validation.issues) {
        blockers.push(issue.details);
      }
    }

    return {
      ready: blockers.length === 0,
      checklist,
      blockers,
    };
  }

  private getImplementationReadiness(): ReadinessResult {
    const implPhase = this.state.getCurrentImplPhase();
    const checklist: ReadinessItem[] = [];
    const blockers: string[] = [];

    if (!implPhase) {
      return {
        ready: false,
        checklist: [],
        blockers: ['No current implementation phase'],
      };
    }

    // All tasks complete or skipped
    const allDone = implPhase.tasks.every(
      (t) => t.status === 'complete' || t.status === 'skipped'
    );
    checklist.push({
      item: 'All tasks complete or skipped',
      complete: allDone,
      required: true,
    });

    // No failed tasks
    const failedTasks = implPhase.tasks.filter((t) => t.status === 'failed');
    const noFailed = failedTasks.length === 0;
    checklist.push({
      item: 'No failed tasks',
      complete: noFailed,
      required: true,
    });

    if (!allDone) {
      const pending = implPhase.tasks.filter((t) => t.status === 'pending');
      const inProgress = implPhase.tasks.filter((t) => t.status === 'in_progress');
      if (pending.length > 0) {
        blockers.push(`${pending.length} task(s) pending`);
      }
      if (inProgress.length > 0) {
        blockers.push(`${inProgress.length} task(s) in progress`);
      }
    }

    if (!noFailed) {
      blockers.push(
        `${failedTasks.length} failed task(s): ${failedTasks.map((t) => t.id).join(', ')}`
      );
    }

    return {
      ready: blockers.length === 0,
      checklist,
      blockers,
    };
  }
}
