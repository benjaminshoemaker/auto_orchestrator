/**
 * LLM Service Layer
 * Coordinates phase conversations and manages LLM interactions
 */

import { AnthropicClient, CompletionOptions } from './anthropic-client.js';
import { ConversationHandler, ConversationOptions } from './conversation.js';
import {
  IDEATION_SYSTEM_PROMPT,
  buildIdeationStartPrompt,
  buildIdeationFollowUpPrompt,
  buildIdeationSummaryPrompt,
  parseIdeationResponse,
  isIdeationComplete,
} from './prompts/ideation.js';
import {
  SPECIFICATION_SYSTEM_PROMPT,
  buildSpecificationStartPrompt,
  buildSpecificationFollowUpPrompt,
  buildSpecificationSummaryPrompt,
  parseSpecificationResponse,
  isSpecificationComplete,
} from './prompts/specification.js';
import {
  PLANNING_SYSTEM_PROMPT,
  buildPlanningStartPrompt,
  buildPlanningFollowUpPrompt,
  buildPlanningSummaryPrompt,
  parsePlanningResponse,
  isPlanningComplete,
} from './prompts/planning.js';
import {
  VALIDATION_SYSTEM_PROMPT,
  buildIdeationValidationPrompt,
  buildSpecificationValidationPrompt,
  buildPlanningValidationPrompt,
  parseValidationResponse,
  ValidationResult,
} from './prompts/validation.js';
import {
  IdeationContent,
  SpecificationContent,
  ImplementationPhase,
} from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Phase conversation state
 */
export interface PhaseConversationState {
  phase: 'ideation' | 'specification' | 'planning';
  turnCount: number;
  partialContent: unknown;
  isComplete: boolean;
}

/**
 * LLM Service options
 */
export interface LLMServiceOptions {
  client?: AnthropicClient;
  apiKey?: string;
  model?: string;
  maxTurns?: number;
  temperature?: number;
  onCostUpdate?: (totalCost: number) => void;
}

/**
 * Result from an LLM phase conversation
 */
export interface LLMPhaseResult<T> {
  content: T;
  tokensUsed: number;
  costUsd: number;
  turnCount: number;
}

/**
 * LLM Service for coordinating phase conversations
 */
export class LLMService {
  private client: AnthropicClient;
  private options: LLMServiceOptions;
  private totalCost: number = 0;

  constructor(options: LLMServiceOptions = {}) {
    this.client =
      options.client ||
      new AnthropicClient({
        apiKey: options.apiKey,
        model: options.model,
      });
    this.options = options;
  }

  /**
   * Get the underlying client
   */
  getClient(): AnthropicClient {
    return this.client;
  }

  /**
   * Get total cost accumulated across all operations
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Reset total cost to zero
   */
  resetCost(): void {
    this.totalCost = 0;
  }

  /**
   * Add cost to total and invoke callback if set
   */
  private addCost(cost: number): void {
    this.totalCost += cost;
    if (this.options.onCostUpdate) {
      this.options.onCostUpdate(this.totalCost);
    }
  }

  /**
   * Create a conversation handler for a phase
   */
  createPhaseConversation(
    phase: 'ideation' | 'specification' | 'planning'
  ): ConversationHandler {
    const systemPrompts: Record<string, string> = {
      ideation: IDEATION_SYSTEM_PROMPT,
      specification: SPECIFICATION_SYSTEM_PROMPT,
      planning: PLANNING_SYSTEM_PROMPT,
    };

    const convOptions: ConversationOptions = {
      systemPrompt: systemPrompts[phase],
      maxTurns: this.options.maxTurns || 20,
      temperature: this.options.temperature,
    };

    return new ConversationHandler(this.client, convOptions);
  }

  // =====================================
  // Ideation Phase Methods
  // =====================================

  /**
   * Start ideation conversation
   */
  async startIdeation(
    projectName: string,
    initialIdea: string
  ): Promise<{ response: string; conversation: ConversationHandler }> {
    const conversation = this.createPhaseConversation('ideation');
    const prompt = buildIdeationStartPrompt(projectName, initialIdea);

    logger.debug('Starting ideation conversation');
    const response = await conversation.send(prompt);

    return { response, conversation };
  }

  /**
   * Continue ideation conversation
   */
  async continueIdeation(
    conversation: ConversationHandler,
    userInput: string,
    currentContent?: Partial<IdeationContent>
  ): Promise<string> {
    const prompt = buildIdeationFollowUpPrompt(userInput, currentContent);
    return conversation.send(prompt);
  }

  /**
   * Complete ideation and get final content
   */
  async completeIdeation(
    conversation: ConversationHandler
  ): Promise<LLMPhaseResult<IdeationContent>> {
    // Build summary from conversation
    const history = conversation.getHistory();
    const summary = history.map((t) => `${t.role}: ${t.content.slice(0, 200)}...`).join('\n');

    const prompt = buildIdeationSummaryPrompt(summary);
    const response = await conversation.send(prompt);

    const content = parseIdeationResponse(response);

    if (!isIdeationComplete(content)) {
      throw new Error('Ideation content is incomplete');
    }

    const usage = conversation.getTokenUsage();
    const cost = conversation.calculateCost();
    this.addCost(cost);

    return {
      content: content as IdeationContent,
      tokensUsed: usage.totalTokens,
      costUsd: cost,
      turnCount: usage.turnCount,
    };
  }

  // =====================================
  // Specification Phase Methods
  // =====================================

  /**
   * Start specification conversation
   */
  async startSpecification(
    projectName: string,
    ideation: IdeationContent
  ): Promise<{ response: string; conversation: ConversationHandler }> {
    const conversation = this.createPhaseConversation('specification');
    const prompt = buildSpecificationStartPrompt(projectName, ideation);

    logger.debug('Starting specification conversation');
    const response = await conversation.send(prompt);

    return { response, conversation };
  }

  /**
   * Continue specification conversation
   */
  async continueSpecification(
    conversation: ConversationHandler,
    userInput: string,
    currentContent?: Partial<SpecificationContent>
  ): Promise<string> {
    const prompt = buildSpecificationFollowUpPrompt(userInput, currentContent);
    return conversation.send(prompt);
  }

  /**
   * Complete specification and get final content
   */
  async completeSpecification(
    conversation: ConversationHandler,
    ideation: IdeationContent
  ): Promise<LLMPhaseResult<SpecificationContent>> {
    const history = conversation.getHistory();
    const summary = history.map((t) => `${t.role}: ${t.content.slice(0, 200)}...`).join('\n');

    const prompt = buildSpecificationSummaryPrompt(summary, ideation);
    const response = await conversation.send(prompt);

    const content = parseSpecificationResponse(response);

    if (!isSpecificationComplete(content)) {
      throw new Error('Specification content is incomplete');
    }

    const usage = conversation.getTokenUsage();
    const cost = conversation.calculateCost();
    this.addCost(cost);

    return {
      content: content as SpecificationContent,
      tokensUsed: usage.totalTokens,
      costUsd: cost,
      turnCount: usage.turnCount,
    };
  }

  // =====================================
  // Planning Phase Methods
  // =====================================

  /**
   * Start planning conversation
   */
  async startPlanning(
    projectName: string,
    ideation: IdeationContent,
    specification: SpecificationContent
  ): Promise<{ response: string; conversation: ConversationHandler }> {
    const conversation = this.createPhaseConversation('planning');
    const prompt = buildPlanningStartPrompt(projectName, ideation, specification);

    logger.debug('Starting planning conversation');
    const response = await conversation.send(prompt);

    return { response, conversation };
  }

  /**
   * Continue planning conversation
   */
  async continuePlanning(
    conversation: ConversationHandler,
    userInput: string,
    phases?: ImplementationPhase[]
  ): Promise<string> {
    const prompt = buildPlanningFollowUpPrompt(userInput, phases);
    return conversation.send(prompt);
  }

  /**
   * Complete planning and get final content
   */
  async completePlanning(
    conversation: ConversationHandler,
    specification: SpecificationContent
  ): Promise<LLMPhaseResult<ImplementationPhase[]>> {
    const history = conversation.getHistory();
    const summary = history.map((t) => `${t.role}: ${t.content.slice(0, 200)}...`).join('\n');

    const prompt = buildPlanningSummaryPrompt(summary, specification);
    const response = await conversation.send(prompt);

    const phases = parsePlanningResponse(response);

    if (!isPlanningComplete(phases)) {
      throw new Error('Planning content is incomplete');
    }

    const usage = conversation.getTokenUsage();
    const cost = conversation.calculateCost();
    this.addCost(cost);

    return {
      content: phases,
      tokensUsed: usage.totalTokens,
      costUsd: cost,
      turnCount: usage.turnCount,
    };
  }

  // =====================================
  // Validation Methods
  // =====================================

  /**
   * Validate ideation content
   */
  async validateIdeation(content: IdeationContent): Promise<ValidationResult> {
    const conversation = new ConversationHandler(this.client, {
      systemPrompt: VALIDATION_SYSTEM_PROMPT,
    });

    const prompt = buildIdeationValidationPrompt(
      content.problem_statement,
      content.target_users,
      content.use_cases,
      content.success_criteria
    );

    const response = await conversation.send(prompt);
    return parseValidationResponse(response);
  }

  /**
   * Validate specification content
   */
  async validateSpecification(content: SpecificationContent): Promise<ValidationResult> {
    const conversation = new ConversationHandler(this.client, {
      systemPrompt: VALIDATION_SYSTEM_PROMPT,
    });

    const techStackStrings = content.tech_stack.map(
      (t) => `${t.layer}: ${t.choice}${t.rationale ? ` - ${t.rationale}` : ''}`
    );

    const prompt = buildSpecificationValidationPrompt(
      content.architecture,
      techStackStrings,
      content.data_models
    );

    const response = await conversation.send(prompt);
    return parseValidationResponse(response);
  }

  /**
   * Validate planning content
   */
  async validatePlanning(phases: ImplementationPhase[]): Promise<ValidationResult> {
    const conversation = new ConversationHandler(this.client, {
      systemPrompt: VALIDATION_SYSTEM_PROMPT,
    });

    const phaseSummary = phases.map((p) => ({
      name: p.name,
      taskCount: p.tasks.length,
    }));

    const prompt = buildPlanningValidationPrompt(phaseSummary);

    const response = await conversation.send(prompt);
    return parseValidationResponse(response);
  }

  // =====================================
  // Single-shot completions
  // =====================================

  /**
   * Get a single completion (not conversational)
   */
  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const response = await this.client.complete(prompt, options);
    return response.content;
  }

  /**
   * Stream a single completion
   */
  async *stream(
    prompt: string,
    options?: CompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    for await (const event of this.client.stream(prompt, options)) {
      if (event.type === 'content_block_delta' && event.text) {
        yield event.text;
      }
    }
  }
}
