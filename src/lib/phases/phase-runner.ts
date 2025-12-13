/**
 * Phase Runner Framework
 * Base class for running interactive phases
 */

import type { LLMService } from '../llm/llm-service.js';
import type { StateManager } from '../state/state-manager.js';
import type { DocumentManager } from '../documents.js';
import * as terminal from '../ui/terminal.js';

export interface PhaseRunnerConfig {
  llmService: LLMService;
  stateManager: StateManager;
  documentManager: DocumentManager;
}

export interface PhaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cost: number;
}

/**
 * Abstract base class for phase runners
 * Provides common lifecycle management and UI patterns
 */
export abstract class PhaseRunner<TInput, TOutput> {
  constructor(protected config: PhaseRunnerConfig) {}

  /**
   * Run the phase with full lifecycle management
   */
  async run(input: TInput): Promise<PhaseResult<TOutput>> {
    try {
      this.showHeader();
      await this.setup(input);
      const result = await this.execute(input);
      await this.persist(result);
      this.showSuccess();
      return { success: true, data: result, cost: this.getCost() };
    } catch (error) {
      this.showError(error as Error);
      return {
        success: false,
        error: (error as Error).message,
        cost: this.getCost(),
      };
    }
  }

  // === Abstract methods to implement in subclasses ===

  /**
   * Get the phase number (1, 2, 3, etc.)
   */
  protected abstract getPhaseNumber(): number;

  /**
   * Get the phase name for display
   */
  protected abstract getPhaseName(): string;

  /**
   * Set up the phase before execution
   */
  protected abstract setup(input: TInput): Promise<void>;

  /**
   * Execute the main phase logic
   */
  protected abstract execute(input: TInput): Promise<TOutput>;

  /**
   * Persist results after successful execution
   */
  protected abstract persist(result: TOutput): Promise<void>;

  /**
   * Get the total cost for this phase
   */
  protected abstract getCost(): number;

  // === Common helpers ===

  /**
   * Show phase header
   */
  protected showHeader(): void {
    terminal.printHeader(`Phase ${this.getPhaseNumber()}: ${this.getPhaseName()}`);
  }

  /**
   * Show success message
   */
  protected showSuccess(): void {
    terminal.printSuccess(`Phase ${this.getPhaseNumber()} complete!`);
    terminal.printInfo(
      `Run "orchestrator approve phase-${this.getPhaseNumber()}" to continue.`
    );
  }

  /**
   * Show error message
   */
  protected showError(error: Error): void {
    terminal.printError(
      `Phase ${this.getPhaseNumber()} failed: ${error.message}`
    );
  }

  // === User interaction helpers ===

  /**
   * Display assistant message
   */
  protected async displayAssistantMessage(message: string): Promise<void> {
    terminal.endStream(); // End any previous streaming
    console.log(); // Blank line
    terminal.printAssistantMessage(message);
  }

  /**
   * Get user input
   */
  protected async getUserInput(): Promise<string> {
    console.log();
    return terminal.prompt(terminal.printUserPrompt());
  }

  /**
   * Display streaming token
   */
  protected streamToken(token: string): void {
    terminal.streamToken(token);
  }
}
