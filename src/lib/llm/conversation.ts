import {
  AnthropicClient,
  Message,
  CompletionOptions,
} from './anthropic-client.js';
import { logger } from '../../utils/logger.js';

/**
 * Conversation turn with metadata
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Token usage summary
 */
export interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  turnCount: number;
}

/**
 * Options for conversation
 */
export interface ConversationOptions {
  systemPrompt?: string;
  maxTurns?: number;
  maxTokensPerTurn?: number;
  temperature?: number;
}

/**
 * Handler for multi-turn conversations with token tracking
 */
export class ConversationHandler {
  private client: AnthropicClient;
  private history: ConversationTurn[] = [];
  private systemPrompt: string | undefined;
  private maxTurns: number;
  private maxTokensPerTurn: number;
  private temperature: number | undefined;

  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;

  constructor(client: AnthropicClient, options: ConversationOptions = {}) {
    this.client = client;
    this.systemPrompt = options.systemPrompt;
    this.maxTurns = options.maxTurns || 50;
    this.maxTokensPerTurn = options.maxTokensPerTurn || 4096;
    this.temperature = options.temperature;
  }

  /**
   * Get conversation history
   */
  getHistory(): ConversationTurn[] {
    return [...this.history];
  }

  /**
   * Get token usage summary
   */
  getTokenUsage(): TokenUsage {
    return {
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      turnCount: Math.floor(this.history.length / 2),
    };
  }

  /**
   * Get the system prompt
   */
  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  /**
   * Set or update the system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Send a message and get a response
   */
  async send(userMessage: string): Promise<string> {
    // Check max turns
    const turnCount = Math.floor(this.history.length / 2);
    if (turnCount >= this.maxTurns) {
      throw new Error(`Maximum turns (${this.maxTurns}) reached`);
    }

    // Add user message to history
    this.history.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // Build messages array
    const messages: Message[] = this.history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    // Get response
    const options: CompletionOptions = {
      systemPrompt: this.systemPrompt,
      maxTokens: this.maxTokensPerTurn,
      temperature: this.temperature,
    };

    logger.debug(`Sending conversation turn ${turnCount + 1}`);

    const response = await this.client.chat(messages, options);

    // Track tokens
    this.totalInputTokens += response.inputTokens;
    this.totalOutputTokens += response.outputTokens;

    // Add assistant response to history
    this.history.push({
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });

    logger.debug(
      `Turn ${turnCount + 1} complete: ${response.inputTokens} input, ${response.outputTokens} output tokens`
    );

    return response.content;
  }

  /**
   * Send a message with streaming response
   * Returns an async generator yielding text chunks
   */
  async *sendStreaming(userMessage: string): AsyncGenerator<string, void, unknown> {
    // Check max turns
    const turnCount = Math.floor(this.history.length / 2);
    if (turnCount >= this.maxTurns) {
      throw new Error(`Maximum turns (${this.maxTurns}) reached`);
    }

    // Add user message to history
    this.history.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // Build messages array
    const messages: Message[] = this.history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    // Get streaming response
    const options: CompletionOptions = {
      systemPrompt: this.systemPrompt,
      maxTokens: this.maxTokensPerTurn,
      temperature: this.temperature,
    };

    logger.debug(`Streaming conversation turn ${turnCount + 1}`);

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of this.client.streamChat(messages, options)) {
      if (event.type === 'message_start' && event.inputTokens) {
        inputTokens = event.inputTokens;
      } else if (event.type === 'content_block_delta' && event.text) {
        fullContent += event.text;
        yield event.text;
      } else if (event.type === 'message_delta' && event.outputTokens) {
        outputTokens = event.outputTokens;
      }
    }

    // Track tokens
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;

    // Add assistant response to history
    this.history.push({
      role: 'assistant',
      content: fullContent,
      timestamp: new Date().toISOString(),
      inputTokens,
      outputTokens,
    });

    logger.debug(
      `Turn ${turnCount + 1} complete: ${inputTokens} input, ${outputTokens} output tokens`
    );
  }

  /**
   * Add a message to history without sending
   * Useful for injecting context or resuming conversations
   */
  addMessage(role: 'user' | 'assistant', content: string): void {
    this.history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get the last assistant message
   */
  getLastResponse(): string | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i]?.role === 'assistant') {
        return this.history[i]?.content || null;
      }
    }
    return null;
  }

  /**
   * Get the last user message
   */
  getLastUserMessage(): string | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i]?.role === 'user') {
        return this.history[i]?.content || null;
      }
    }
    return null;
  }

  /**
   * Clear conversation history
   */
  clear(): void {
    this.history = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    logger.debug('Conversation history cleared');
  }

  /**
   * Fork the conversation from a specific turn
   * Creates a new handler with history up to that turn
   */
  fork(turnIndex: number): ConversationHandler {
    if (turnIndex < 0 || turnIndex >= this.history.length) {
      throw new Error(`Invalid turn index: ${turnIndex}`);
    }

    const forked = new ConversationHandler(this.client, {
      systemPrompt: this.systemPrompt,
      maxTurns: this.maxTurns,
      maxTokensPerTurn: this.maxTokensPerTurn,
      temperature: this.temperature,
    });

    // Copy history up to the specified index (inclusive)
    for (let i = 0; i <= turnIndex; i++) {
      const turn = this.history[i];
      if (turn) {
        forked.history.push({ ...turn });
        if (turn.inputTokens) {
          forked.totalInputTokens += turn.inputTokens;
        }
        if (turn.outputTokens) {
          forked.totalOutputTokens += turn.outputTokens;
        }
      }
    }

    return forked;
  }

  /**
   * Export conversation to a serializable format
   */
  export(): {
    systemPrompt: string | undefined;
    history: ConversationTurn[];
    tokenUsage: TokenUsage;
  } {
    return {
      systemPrompt: this.systemPrompt,
      history: [...this.history],
      tokenUsage: this.getTokenUsage(),
    };
  }

  /**
   * Import conversation from exported format
   */
  import(data: {
    systemPrompt?: string;
    history: ConversationTurn[];
    tokenUsage?: TokenUsage;
  }): void {
    this.systemPrompt = data.systemPrompt;
    this.history = [...data.history];

    if (data.tokenUsage) {
      this.totalInputTokens = data.tokenUsage.totalInputTokens;
      this.totalOutputTokens = data.tokenUsage.totalOutputTokens;
    } else {
      // Recalculate from history
      this.totalInputTokens = 0;
      this.totalOutputTokens = 0;
      for (const turn of this.history) {
        if (turn.inputTokens) {
          this.totalInputTokens += turn.inputTokens;
        }
        if (turn.outputTokens) {
          this.totalOutputTokens += turn.outputTokens;
        }
      }
    }

    logger.debug(`Imported conversation with ${this.history.length} turns`);
  }

  /**
   * Calculate cost for this conversation
   */
  calculateCost(): number {
    return this.client.calculateCost(this.totalInputTokens, this.totalOutputTokens);
  }
}
