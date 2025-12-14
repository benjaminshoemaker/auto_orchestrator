/**
 * Pipeline
 * Unified pipeline for coordinating all phases of the orchestrator
 */

import { DocumentManager } from './documents.js';
import { StateManager } from './state/state-manager.js';
import { PhaseManager } from './state/phase-manager.js';
import { LLMService } from './llm/llm-service.js';
import { IdeationPhase } from './phases/ideation-phase.js';
import { SpecPhase } from './phases/spec-phase.js';
import { PlanningPhase } from './phases/planning-phase.js';
import { Orchestrator } from './execution/orchestrator.js';
import { GitClient } from './git/git-client.js';
import { GitWorkflowManager } from './git/workflow-manager.js';
import { initProjectDir } from '../utils/project.js';
import { slugify } from '../utils/templates.js';
import * as terminal from './ui/terminal.js';

export interface PipelineConfig {
  projectDir: string;
  interactive: boolean;
  gitEnabled?: boolean;
  gitAutoCommit?: boolean;
}

export interface PipelineSummary {
  projectName: string;
  phasesCompleted: string[];
  tasksCompleted: number;
  tasksFailed: number;
  totalCost: number;
}

export interface PhaseResult {
  success: boolean;
  cost: number;
  error?: string;
}

/**
 * Unified pipeline for the orchestrator
 */
export class Pipeline {
  private documentManager: DocumentManager;
  private stateManager: StateManager;
  private phaseManager: PhaseManager;
  private llmService: LLMService;
  private gitWorkflow?: GitWorkflowManager;
  private config: Required<PipelineConfig>;

  constructor(config: PipelineConfig) {
    this.config = {
      projectDir: config.projectDir,
      interactive: config.interactive,
      gitEnabled: config.gitEnabled ?? true,
      gitAutoCommit: config.gitAutoCommit ?? true,
    };

    this.documentManager = new DocumentManager(config.projectDir);
    this.stateManager = new StateManager(this.documentManager, config.projectDir);
    this.phaseManager = new PhaseManager(this.stateManager);
    this.llmService = new LLMService({});
  }

  /**
   * Initialize and run the full pipeline
   */
  async initAndRun(idea: string): Promise<PipelineSummary> {
    // Initialize project
    const projectName = slugify(idea);
    await initProjectDir(this.config.projectDir, projectName);
    await this.stateManager.load();

    // Set up Git workflow
    await this.setupGitWorkflow();

    const phasesCompleted: string[] = [];
    let totalCost = 0;

    // Run Phase 1: Ideation
    terminal.printHeader('Phase 1: Idea Refinement');
    const phase1 = await this.runPhase1(idea);
    if (!phase1.success) {
      throw new Error(`Phase 1 failed: ${phase1.error || 'Unknown error'}`);
    }
    phasesCompleted.push('ideation');
    totalCost += phase1.cost;

    if (this.config.interactive) {
      await this.waitForApproval('phase-1');
    } else {
      this.stateManager.approvePhase('phase-1');
      await this.stateManager.save();
    }

    // Run Phase 2: Specification
    terminal.printHeader('Phase 2: Technical Specification');
    const phase2 = await this.runPhase2();
    if (!phase2.success) {
      throw new Error(`Phase 2 failed: ${phase2.error || 'Unknown error'}`);
    }
    phasesCompleted.push('specification');
    totalCost += phase2.cost;

    if (this.config.interactive) {
      await this.waitForApproval('phase-2');
    } else {
      this.stateManager.approvePhase('phase-2');
      await this.stateManager.save();
    }

    // Run Phase 3: Planning
    terminal.printHeader('Phase 3: Implementation Planning');
    const phase3 = await this.runPhase3();
    if (!phase3.success) {
      throw new Error(`Phase 3 failed: ${phase3.error || 'Unknown error'}`);
    }
    phasesCompleted.push('planning');
    totalCost += phase3.cost;

    if (this.config.interactive) {
      await this.waitForApproval('phase-3');
    } else {
      this.stateManager.approvePhase('phase-3');
      await this.stateManager.save();
    }

    // Run Implementation
    terminal.printHeader('Phase 4: Implementation');
    const impl = await this.runImplementation();
    if (impl.success) {
      phasesCompleted.push('implementation');
    }
    totalCost += impl.totalCost;

    return {
      projectName: this.stateManager.getMeta().project_name,
      phasesCompleted,
      tasksCompleted: impl.tasksCompleted,
      tasksFailed: impl.tasksFailed,
      totalCost,
    };
  }

  /**
   * Resume from current state
   */
  async resume(): Promise<PipelineSummary> {
    await this.stateManager.load();
    await this.setupGitWorkflow();

    const meta = this.stateManager.getMeta();
    const phasesCompleted: string[] = [];
    let totalCost = meta.cost.total_cost_usd;

    // Check Phase 1
    if (!meta.gates.ideation_complete) {
      const doc = this.stateManager.getProject();
      const phase1 = await this.runPhase1(doc.meta.project_name);
      if (!phase1.success) {
        throw new Error(`Phase 1 failed: ${phase1.error || 'Unknown error'}`);
      }
      totalCost += phase1.cost;
    }

    if (meta.gates.ideation_complete) {
      phasesCompleted.push('ideation');
    }

    if (!meta.gates.ideation_approved) {
      if (this.config.interactive) {
        await this.waitForApproval('phase-1');
      } else {
        this.stateManager.approvePhase('phase-1');
        await this.stateManager.save();
      }
    }

    // Check Phase 2
    if (!meta.gates.spec_complete && meta.gates.ideation_approved) {
      const phase2 = await this.runPhase2();
      if (!phase2.success) {
        throw new Error(`Phase 2 failed: ${phase2.error || 'Unknown error'}`);
      }
      totalCost += phase2.cost;
    }

    if (meta.gates.spec_complete) {
      phasesCompleted.push('specification');
    }

    if (!meta.gates.spec_approved && meta.gates.spec_complete) {
      if (this.config.interactive) {
        await this.waitForApproval('phase-2');
      } else {
        this.stateManager.approvePhase('phase-2');
        await this.stateManager.save();
      }
    }

    // Check Phase 3
    if (!meta.gates.planning_complete && meta.gates.spec_approved) {
      const phase3 = await this.runPhase3();
      if (!phase3.success) {
        throw new Error(`Phase 3 failed: ${phase3.error || 'Unknown error'}`);
      }
      totalCost += phase3.cost;
    }

    if (meta.gates.planning_complete) {
      phasesCompleted.push('planning');
    }

    if (!meta.gates.planning_approved && meta.gates.planning_complete) {
      if (this.config.interactive) {
        await this.waitForApproval('phase-3');
      } else {
        this.stateManager.approvePhase('phase-3');
        await this.stateManager.save();
      }
    }

    // Run implementation if planning is approved
    let impl = { success: false, tasksCompleted: 0, tasksFailed: 0, totalCost: 0 };
    if (meta.gates.planning_approved) {
      impl = await this.runImplementation();
      if (impl.success) {
        phasesCompleted.push('implementation');
      }
      totalCost += impl.totalCost;
    }

    return {
      projectName: this.stateManager.getMeta().project_name,
      phasesCompleted,
      tasksCompleted: impl.tasksCompleted,
      tasksFailed: impl.tasksFailed,
      totalCost,
    };
  }

  /**
   * Get the state manager
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * Get the document manager
   */
  getDocumentManager(): DocumentManager {
    return this.documentManager;
  }

  private async setupGitWorkflow(): Promise<void> {
    if (!this.config.gitEnabled) return;

    try {
      const gitClient = new GitClient(this.config.projectDir);
      const isRepo = await gitClient.isRepo();

      if (!isRepo) {
        await gitClient.init();
        terminal.printInfo('Initialized Git repository');
      }

      this.gitWorkflow = new GitWorkflowManager({
        gitClient,
        enabled: true,
        autoCommit: this.config.gitAutoCommit,
      });
    } catch {
      terminal.printWarning('Git workflow disabled - could not initialize');
    }
  }

  private async runPhase1(idea: string): Promise<PhaseResult> {
    try {
      const runner = new IdeationPhase({
        llmService: this.llmService,
        stateManager: this.stateManager,
        documentManager: this.documentManager,
      });

      const result = await runner.run({ idea });
      return {
        success: result.success,
        cost: result.cost,
        error: result.success ? undefined : 'Phase 1 execution failed',
      };
    } catch (error) {
      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async runPhase2(): Promise<PhaseResult> {
    try {
      const doc = this.stateManager.getProject();
      if (!doc.ideation) {
        return { success: false, cost: 0, error: 'Ideation content missing' };
      }

      const runner = new SpecPhase({
        llmService: this.llmService,
        stateManager: this.stateManager,
        documentManager: this.documentManager,
      });

      const result = await runner.run({ ideation: doc.ideation });
      return {
        success: result.success,
        cost: result.cost,
        error: result.success ? undefined : 'Phase 2 execution failed',
      };
    } catch (error) {
      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async runPhase3(): Promise<PhaseResult> {
    try {
      const doc = this.stateManager.getProject();
      if (!doc.specification) {
        return { success: false, cost: 0, error: 'Specification content missing' };
      }

      const runner = new PlanningPhase({
        llmService: this.llmService,
        stateManager: this.stateManager,
        documentManager: this.documentManager,
      });

      const result = await runner.run({ specification: doc.specification });
      return {
        success: result.success,
        cost: result.cost,
        error: result.success ? undefined : 'Phase 3 execution failed',
      };
    } catch (error) {
      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async runImplementation(): Promise<{
    success: boolean;
    tasksCompleted: number;
    tasksFailed: number;
    totalCost: number;
  }> {
    try {
      const orchestrator = new Orchestrator(
        this.stateManager,
        this.documentManager,
        {
          gitWorkflow: this.gitWorkflow,
        }
      );

      const result = await orchestrator.execute();

      return {
        success: result.success,
        tasksCompleted: result.tasksCompleted,
        tasksFailed: result.tasksFailed,
        totalCost: 0, // Implementation cost tracking can be added later
      };
    } catch (error) {
      terminal.printError(
        `Implementation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return {
        success: false,
        tasksCompleted: 0,
        tasksFailed: 0,
        totalCost: 0,
      };
    }
  }

  private async waitForApproval(phase: string): Promise<void> {
    terminal.printInfo('');
    terminal.printInfo(`Phase ${phase.replace('phase-', '')} complete!`);
    terminal.printInfo('Review the PROJECT.md file, then:');

    const approved = await terminal.confirm('Approve and continue?', true);

    if (approved) {
      this.stateManager.approvePhase(phase);
      await this.stateManager.save();
      terminal.printSuccess(`${phase} approved`);

      if (this.gitWorkflow) {
        await this.gitWorkflow.commitStateChange(`${phase} approved`);
      }
    } else {
      throw new Error('User declined approval');
    }
  }
}
