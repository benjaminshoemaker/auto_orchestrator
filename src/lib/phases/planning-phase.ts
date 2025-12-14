/**
 * Planning Phase Implementation
 * Phase 3: Implementation planning
 */

import { PhaseRunner, PhaseRunnerConfig, PhaseResult } from './phase-runner.js';
import type { SpecificationContent, ImplementationPhase } from '../../types/index.js';
import type { ConversationHandler } from '../llm/conversation.js';
import { DependencyResolver } from '../state/dependency-resolver.js';
import * as terminal from '../ui/terminal.js';
import { isPlanningComplete } from '../llm/prompts/planning.js';

export interface PlanningInput {
  specification: SpecificationContent;
  ideation?: {
    use_cases: string[];
  };
  projectName?: string;
}

/**
 * Phase 3: Implementation Planning
 * Creates implementation phases and tasks from specification
 */
export class PlanningPhase extends PhaseRunner<PlanningInput, ImplementationPhase[]> {
  private cost: number = 0;
  private conversation: ConversationHandler | null = null;

  protected getPhaseNumber(): number {
    return 3;
  }

  protected getPhaseName(): string {
    return 'Implementation Planning';
  }

  protected async setup(input: PlanningInput): Promise<void> {
    terminal.printSection('Architecture', input.specification.architecture);
    terminal.printInfo('Creating implementation plan...');
    terminal.printInfo('Type /quit to cancel, /complete when done.');
    console.log();
  }

  protected async execute(input: PlanningInput): Promise<ImplementationPhase[]> {
    const projectName = input.projectName || 'project';
    const llmService = this.config.llmService;

    // Get ideation for context (use_cases needed for planning)
    const doc = this.config.stateManager.getProject();
    const ideation = doc.ideation || input.ideation;

    if (!ideation) {
      throw new Error('Ideation content is required for planning');
    }

    // Start the conversation
    const { response, conversation } = await llmService.startPlanning(
      projectName,
      ideation,
      input.specification
    );
    this.conversation = conversation;

    // Display initial assistant message
    await this.displayAssistantMessage(response);

    // Conversation loop
    let lastResponse = response;
    let phases: ImplementationPhase[] | undefined;

    while (true) {
      // Get user input
      const userInput = await this.getUserInput();

      // Check for quit command
      if (userInput.toLowerCase() === '/quit') {
        throw new Error('User cancelled phase');
      }

      // Check for complete command
      if (userInput.toLowerCase() === '/complete' || userInput.toLowerCase() === '/done') {
        break;
      }

      // Continue conversation
      lastResponse = await llmService.continuePlanning(
        conversation,
        userInput,
        phases
      );

      // Display response
      await this.displayAssistantMessage(lastResponse);
    }

    // Complete the phase and get final content
    const result = await llmService.completePlanning(conversation, input.specification);
    this.cost = result.costUsd;

    if (!isPlanningComplete(result.content)) {
      throw new Error('Planning content is incomplete');
    }

    // Validate dependencies
    const allTasks = result.content.flatMap((p) => p.tasks);
    const resolver = new DependencyResolver(allTasks);
    const validation = resolver.validate();

    if (!validation.valid) {
      terminal.printWarning('Dependency issues found:');
      validation.issues.forEach((issue) => {
        terminal.printWarning(`  ${issue.taskId}: ${issue.details}`);
      });
      // Continue anyway, but warn
    }

    return result.content;
  }

  protected async persist(result: ImplementationPhase[]): Promise<void> {
    const stateManager = this.config.stateManager;

    // Add implementation phases to state
    stateManager.addImplementationPhases(result);

    // Update meta to mark phase complete
    const meta = stateManager.getMeta();
    const updatedMeta = {
      ...meta,
      current_phase: 3 as const,
      current_phase_name: 'Implementation Planning',
      phase_status: 'complete' as const,
      gates: {
        ...meta.gates,
        planning_complete: true,
      },
      implementation: {
        total_phases: result.length,
        completed_phases: 0,
        current_impl_phase: 1,
        current_impl_phase_name: result[0]?.name || 'Setup',
      },
    };

    // Update the document
    const doc = stateManager.getProject();
    doc.meta = updatedMeta;
    doc.implementation_phases = result;

    // Add cost
    stateManager.addCost(0, this.cost);

    // Save to disk
    await stateManager.save();

    // Show summary
    this.showPlanSummary(result);
  }

  protected getCost(): number {
    return this.cost;
  }

  private showPlanSummary(phases: ImplementationPhase[]): void {
    terminal.printSection('Implementation Plan', '');
    phases.forEach((phase) => {
      console.log(
        `  Phase ${phase.phase_number}: ${phase.name} (${phase.tasks.length} tasks)`
      );
    });
    const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
    console.log(`\n  Total: ${phases.length} phases, ${totalTasks} tasks`);
  }
}
