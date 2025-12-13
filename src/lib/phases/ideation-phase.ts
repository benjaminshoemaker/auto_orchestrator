/**
 * Ideation Phase Implementation
 * Phase 1: Interactive idea refinement
 */

import { PhaseRunner, PhaseRunnerConfig, PhaseResult } from './phase-runner.js';
import type { IdeationContent } from '../../types/index.js';
import type { ConversationHandler } from '../llm/conversation.js';
import * as terminal from '../ui/terminal.js';
import { isIdeationComplete } from '../llm/prompts/ideation.js';

export interface IdeationInput {
  idea: string;
  projectName?: string;
}

/**
 * Phase 1: Idea Refinement
 * Conducts an interactive conversation to refine the initial idea
 */
export class IdeationPhase extends PhaseRunner<IdeationInput, IdeationContent> {
  private cost: number = 0;
  private conversation: ConversationHandler | null = null;

  protected getPhaseNumber(): number {
    return 1;
  }

  protected getPhaseName(): string {
    return 'Idea Refinement';
  }

  protected async setup(input: IdeationInput): Promise<void> {
    terminal.printSection('Your Idea', input.idea);
    terminal.printInfo("I'll ask questions to understand your idea better.");
    terminal.printInfo('Type /quit to cancel at any time.');
    console.log();
  }

  protected async execute(input: IdeationInput): Promise<IdeationContent> {
    const projectName = input.projectName || 'project';
    const llmService = this.config.llmService;

    // Start the conversation
    const { response, conversation } = await llmService.startIdeation(
      projectName,
      input.idea
    );
    this.conversation = conversation;

    // Display initial assistant message
    await this.displayAssistantMessage(response);

    // Conversation loop
    let lastResponse = response;
    let partialContent: Partial<IdeationContent> | undefined;

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
      lastResponse = await llmService.continueIdeation(
        conversation,
        userInput,
        partialContent
      );

      // Display response
      await this.displayAssistantMessage(lastResponse);
    }

    // Complete the phase and get final content
    const result = await llmService.completeIdeation(conversation);
    this.cost = result.costUsd;

    if (!isIdeationComplete(result.content)) {
      throw new Error('Ideation content is incomplete');
    }

    return result.content;
  }

  protected async persist(result: IdeationContent): Promise<void> {
    const stateManager = this.config.stateManager;

    // Update state with ideation content
    stateManager.setIdeationContent(result);

    // Update meta to mark phase complete
    const meta = stateManager.getMeta();
    const updatedMeta = {
      ...meta,
      current_phase: 1 as const,
      current_phase_name: 'Idea Refinement',
      phase_status: 'complete' as const,
      gates: {
        ...meta.gates,
        ideation_complete: true,
      },
    };

    // Update the document
    const doc = stateManager.getProject();
    doc.meta = updatedMeta;
    doc.ideation = result;

    // Add cost
    stateManager.addCost(0, this.cost);

    // Save to disk
    await stateManager.save();

    // Show summary
    terminal.printSection('Summary', this.formatSummary(result));
  }

  protected getCost(): number {
    return this.cost;
  }

  private formatSummary(result: IdeationContent): string {
    const problemPreview = result.problem_statement.substring(0, 100);
    const usersPreview = result.target_users.substring(0, 100);

    return `
Problem: ${problemPreview}${result.problem_statement.length > 100 ? '...' : ''}
Users: ${usersPreview}${result.target_users.length > 100 ? '...' : ''}
Use Cases: ${result.use_cases.length} defined
Success Criteria: ${result.success_criteria.length} defined
    `.trim();
  }
}
