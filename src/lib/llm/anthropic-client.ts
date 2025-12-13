import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger.js';

/**
 * Message role in a conversation
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Message in a conversation
 */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Response from the Anthropic API
 */
export interface CompletionResponse {
  content: string;
  model: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Options for completion requests
 */
export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stopSequences?: string[];
}

/**
 * Streaming event types
 */
export type StreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop';

/**
 * Streaming event
 */
export interface StreamEvent {
  type: StreamEventType;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Cost per 1M tokens for different models
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

/**
 * Default model to use
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Default max tokens
 */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Client for the Anthropic API
 */
export class AnthropicClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(options: { apiKey?: string; model?: string; maxTokens?: number } = {}) {
    // Use provided API key or fall back to environment variable
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model || DEFAULT_MODEL;
    this.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  /**
   * Get the configured model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Send a single completion request
   */
  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || this.maxTokens;

    logger.debug(`Sending completion request to ${model}`);

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: options.temperature,
      system: options.systemPrompt,
      stop_sequences: options.stopSequences,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = this.extractTextContent(response);

    return {
      content,
      model: response.model,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  /**
   * Send a multi-turn chat request
   */
  async chat(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResponse> {
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || this.maxTokens;

    logger.debug(`Sending chat request to ${model} with ${messages.length} messages`);

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: options.temperature,
      system: options.systemPrompt,
      stop_sequences: options.stopSequences,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const content = this.extractTextContent(response);

    return {
      content,
      model: response.model,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  /**
   * Stream a completion request
   * Yields events as they arrive
   */
  async *stream(
    prompt: string,
    options: CompletionOptions = {}
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || this.maxTokens;

    logger.debug(`Streaming completion request to ${model}`);

    const stream = this.client.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature: options.temperature,
      system: options.systemPrompt,
      stop_sequences: options.stopSequences,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'message_start') {
        yield {
          type: 'message_start',
          inputTokens: event.message.usage.input_tokens,
        };
      } else if (event.type === 'content_block_start') {
        yield { type: 'content_block_start' };
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield {
            type: 'content_block_delta',
            text: event.delta.text,
          };
        }
      } else if (event.type === 'content_block_stop') {
        yield { type: 'content_block_stop' };
      } else if (event.type === 'message_delta') {
        yield {
          type: 'message_delta',
          outputTokens: event.usage.output_tokens,
        };
      } else if (event.type === 'message_stop') {
        yield { type: 'message_stop' };
      }
    }
  }

  /**
   * Stream a chat request
   */
  async *streamChat(
    messages: Message[],
    options: CompletionOptions = {}
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || this.maxTokens;

    logger.debug(`Streaming chat request to ${model} with ${messages.length} messages`);

    const stream = this.client.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature: options.temperature,
      system: options.systemPrompt,
      stop_sequences: options.stopSequences,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === 'message_start') {
        yield {
          type: 'message_start',
          inputTokens: event.message.usage.input_tokens,
        };
      } else if (event.type === 'content_block_start') {
        yield { type: 'content_block_start' };
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield {
            type: 'content_block_delta',
            text: event.delta.text,
          };
        }
      } else if (event.type === 'content_block_stop') {
        yield { type: 'content_block_stop' };
      } else if (event.type === 'message_delta') {
        yield {
          type: 'message_delta',
          outputTokens: event.usage.output_tokens,
        };
      } else if (event.type === 'message_stop') {
        yield { type: 'message_stop' };
      }
    }
  }

  /**
   * Calculate cost in USD for token usage
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    model?: string
  ): number {
    const modelId = model || this.model;
    const costs = MODEL_COSTS[modelId];

    if (!costs) {
      logger.warn(`Unknown model ${modelId}, using default cost`);
      // Use Sonnet pricing as default
      return (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000;
    }

    return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
  }

  /**
   * Extract text content from a message response
   */
  private extractTextContent(response: Anthropic.Message): string {
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    return textBlocks.map((block) => block.text).join('');
  }
}
