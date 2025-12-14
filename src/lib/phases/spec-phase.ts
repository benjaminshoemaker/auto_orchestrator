/**
 * Specification Phase Implementation
 * Phase 2: Technical specification
 */

import { PhaseRunner } from './phase-runner.js';
import type { IdeationContent, SpecificationContent } from '../../types/index.js';
import type { ConversationHandler } from '../llm/conversation.js';
import * as terminal from '../ui/terminal.js';
import { isSpecificationComplete } from '../llm/prompts/specification.js';

export interface SpecInput {
  ideation: IdeationContent;
  projectName?: string;
}

/**
 * Phase 2: Technical Specification
 * Creates technical specification based on ideation results
 */
export class SpecPhase extends PhaseRunner<SpecInput, SpecificationContent> {
  private cost: number = 0;
  private conversation: ConversationHandler | null = null;

  protected getPhaseNumber(): number {
    return 2;
  }

  protected getPhaseName(): string {
    return 'Specification';
  }

  protected async setup(input: SpecInput): Promise<void> {
    terminal.printSection('From Phase 1', this.summarizeIdeation(input.ideation));
    terminal.printInfo('Creating technical specification...');
    terminal.printInfo('Type /quit to cancel, /complete when done.');
    console.log();
  }

  protected async execute(input: SpecInput): Promise<SpecificationContent> {
    const projectName = input.projectName || 'project';
    const llmService = this.config.llmService;

    // Start the conversation
    const { response, conversation } = await llmService.startSpecification(
      projectName,
      input.ideation
    );
    this.conversation = conversation;

    // Display initial assistant message
    await this.displayAssistantMessage(response);

    // Conversation loop
    let lastResponse = response;
    let partialContent: Partial<SpecificationContent> | undefined;

    let running = true;
    while (running) {
      // Get user input
      const userInput = await this.getUserInput();

      // Check for quit command
      if (userInput.toLowerCase() === '/quit') {
        throw new Error('User cancelled phase');
      }

      // Check for complete command
      if (userInput.toLowerCase() === '/complete' || userInput.toLowerCase() === '/done') {
        running = false;
        continue;
      }

      // Continue conversation
      lastResponse = await llmService.continueSpecification(
        conversation,
        userInput,
        partialContent
      );

      // Display response
      await this.displayAssistantMessage(lastResponse);
    }

    // Complete the phase and get final content
    const result = await llmService.completeSpecification(conversation, input.ideation);
    this.cost = result.costUsd;

    if (!isSpecificationComplete(result.content)) {
      throw new Error('Specification content is incomplete');
    }

    return result.content;
  }

  protected async persist(result: SpecificationContent): Promise<void> {
    const stateManager = this.config.stateManager;

    // Update state with specification content
    stateManager.setSpecificationContent(result);

    // Update meta to mark phase complete
    const meta = stateManager.getMeta();
    const updatedMeta = {
      ...meta,
      current_phase: 2 as const,
      current_phase_name: 'Specification',
      phase_status: 'complete' as const,
      gates: {
        ...meta.gates,
        spec_complete: true,
      },
    };

    // Update the document
    const doc = stateManager.getProject();
    doc.meta = updatedMeta;
    doc.specification = result;

    // Add cost
    stateManager.addCost(0, this.cost);

    // Save to disk
    await stateManager.save();

    // Show tech stack summary
    terminal.printSection('Tech Stack', this.formatTechStack(result));
  }

  protected getCost(): number {
    return this.cost;
  }

  private summarizeIdeation(ideation: IdeationContent): string {
    const preview = ideation.problem_statement.substring(0, 200);
    return `${preview}${ideation.problem_statement.length > 200 ? '...' : ''}`;
  }

  private formatTechStack(spec: SpecificationContent): string {
    return spec.tech_stack.map((t) => `${t.layer}: ${t.choice}`).join('\n');
  }
}
