import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AnthropicClient,
  CompletionOptions,
  Message,
  MODEL_COSTS,
  DEFAULT_MODEL,
} from '../../../../src/lib/llm/anthropic-client.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
        stream: vi.fn(),
      },
    })),
  };
});

// Get mocked Anthropic constructor
import Anthropic from '@anthropic-ai/sdk';
const MockedAnthropic = vi.mocked(Anthropic);

describe('AnthropicClient', () => {
  const TEST_API_KEY = 'test-api-key';
  let client: AnthropicClient;
  let mockMessages: {
    create: ReturnType<typeof vi.fn>;
    stream: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create fresh mock implementation
    mockMessages = {
      create: vi.fn(),
      stream: vi.fn(),
    };

    MockedAnthropic.mockImplementation(
      () =>
        ({
          messages: mockMessages,
        }) as unknown as Anthropic
    );

    client = new AnthropicClient({ apiKey: TEST_API_KEY });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with provided API key', () => {
      const client = new AnthropicClient({ apiKey: 'my-key' });
      expect(client).toBeDefined();
      expect(MockedAnthropic).toHaveBeenCalledWith({ apiKey: 'my-key' });
    });

    it('should use environment variable if no key provided', () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'env-key';

      try {
        const client = new AnthropicClient();
        expect(client).toBeDefined();
        expect(MockedAnthropic).toHaveBeenCalledWith({ apiKey: 'env-key' });
      } finally {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      }
    });

    it('should throw if no API key available', () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        expect(() => new AnthropicClient()).toThrow('ANTHROPIC_API_KEY is required');
      } finally {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      }
    });

    it('should use default model if not specified', () => {
      const client = new AnthropicClient({ apiKey: TEST_API_KEY });
      expect(client.getModel()).toBe(DEFAULT_MODEL);
    });

    it('should use provided model', () => {
      const client = new AnthropicClient({
        apiKey: TEST_API_KEY,
        model: 'claude-3-opus-20240229',
      });
      expect(client.getModel()).toBe('claude-3-opus-20240229');
    });
  });

  describe('complete', () => {
    it('should send completion request', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Hello, world!' }],
        model: DEFAULT_MODEL,
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      mockMessages.create.mockResolvedValue(mockResponse);

      const result = await client.complete('Say hello');

      expect(mockMessages.create).toHaveBeenCalledWith({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        temperature: undefined,
        system: undefined,
        stop_sequences: undefined,
        messages: [{ role: 'user', content: 'Say hello' }],
      });

      expect(result).toEqual({
        content: 'Hello, world!',
        model: DEFAULT_MODEL,
        stopReason: 'end_turn',
        inputTokens: 10,
        outputTokens: 5,
      });
    });

    it('should use custom options', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-opus-20240229',
        stop_reason: 'stop_sequence',
        usage: {
          input_tokens: 20,
          output_tokens: 15,
        },
      };

      mockMessages.create.mockResolvedValue(mockResponse);

      const options: CompletionOptions = {
        model: 'claude-3-opus-20240229',
        maxTokens: 1000,
        temperature: 0.5,
        systemPrompt: 'You are helpful',
        stopSequences: ['END'],
      };

      await client.complete('Test', options);

      expect(mockMessages.create).toHaveBeenCalledWith({
        model: 'claude-3-opus-20240229',
        max_tokens: 1000,
        temperature: 0.5,
        system: 'You are helpful',
        stop_sequences: ['END'],
        messages: [{ role: 'user', content: 'Test' }],
      });
    });

    it('should handle multiple text blocks', async () => {
      const mockResponse = {
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: ' Part 2' },
        ],
        model: DEFAULT_MODEL,
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValue(mockResponse);

      const result = await client.complete('Test');

      expect(result.content).toBe('Part 1 Part 2');
    });
  });

  describe('chat', () => {
    it('should send chat request with multiple messages', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'I can help with that!' }],
        model: DEFAULT_MODEL,
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 50,
          output_tokens: 20,
        },
      };

      mockMessages.create.mockResolvedValue(mockResponse);

      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'Can you help me?' },
      ];

      const result = await client.chat(messages);

      expect(mockMessages.create).toHaveBeenCalledWith({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        temperature: undefined,
        system: undefined,
        stop_sequences: undefined,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
          { role: 'user', content: 'Can you help me?' },
        ],
      });

      expect(result.content).toBe('I can help with that!');
      expect(result.inputTokens).toBe(50);
      expect(result.outputTokens).toBe(20);
    });

    it('should use system prompt in chat', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response' }],
        model: DEFAULT_MODEL,
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 30,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValue(mockResponse);

      const messages: Message[] = [{ role: 'user', content: 'Test' }];

      await client.chat(messages, { systemPrompt: 'Be concise' });

      expect(mockMessages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'Be concise',
        })
      );
    });
  });

  describe('stream', () => {
    it('should yield stream events', async () => {
      // Create an async iterable mock
      async function* mockStreamIterable() {
        yield {
          type: 'message_start',
          message: { usage: { input_tokens: 10 } },
        };
        yield { type: 'content_block_start' };
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' },
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: ' World' },
        };
        yield { type: 'content_block_stop' };
        yield {
          type: 'message_delta',
          usage: { output_tokens: 5 },
        };
        yield { type: 'message_stop' };
      }

      mockMessages.stream.mockReturnValue(mockStreamIterable());

      const events = [];
      for await (const event of client.stream('Say hello')) {
        events.push(event);
      }

      expect(mockMessages.stream).toHaveBeenCalledWith({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        temperature: undefined,
        system: undefined,
        stop_sequences: undefined,
        messages: [{ role: 'user', content: 'Say hello' }],
      });

      expect(events).toHaveLength(7);
      expect(events[0]).toEqual({ type: 'message_start', inputTokens: 10 });
      expect(events[1]).toEqual({ type: 'content_block_start' });
      expect(events[2]).toEqual({ type: 'content_block_delta', text: 'Hello' });
      expect(events[3]).toEqual({ type: 'content_block_delta', text: ' World' });
      expect(events[4]).toEqual({ type: 'content_block_stop' });
      expect(events[5]).toEqual({ type: 'message_delta', outputTokens: 5 });
      expect(events[6]).toEqual({ type: 'message_stop' });
    });

    it('should use custom options in stream', async () => {
      async function* mockStreamIterable() {
        yield { type: 'message_stop' };
      }

      mockMessages.stream.mockReturnValue(mockStreamIterable());

      // Consume the stream
      for await (const _ of client.stream('Test', {
        model: 'claude-3-opus-20240229',
        maxTokens: 1000,
        temperature: 0.7,
        systemPrompt: 'Be creative',
      })) {
        // consume events
      }

      expect(mockMessages.stream).toHaveBeenCalledWith({
        model: 'claude-3-opus-20240229',
        max_tokens: 1000,
        temperature: 0.7,
        system: 'Be creative',
        stop_sequences: undefined,
        messages: [{ role: 'user', content: 'Test' }],
      });
    });
  });

  describe('streamChat', () => {
    it('should stream chat with multiple messages', async () => {
      async function* mockStreamIterable() {
        yield {
          type: 'message_start',
          message: { usage: { input_tokens: 30 } },
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Response' },
        };
        yield {
          type: 'message_delta',
          usage: { output_tokens: 10 },
        };
        yield { type: 'message_stop' };
      }

      mockMessages.stream.mockReturnValue(mockStreamIterable());

      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
      ];

      const events = [];
      for await (const event of client.streamChat(messages)) {
        events.push(event);
      }

      expect(mockMessages.stream).toHaveBeenCalledWith({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        temperature: undefined,
        system: undefined,
        stop_sequences: undefined,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
          { role: 'user', content: 'How are you?' },
        ],
      });

      expect(events).toHaveLength(4);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for known model', () => {
      const cost = client.calculateCost(1_000_000, 500_000);

      // Default model (claude-sonnet-4-20250514): $3/1M input, $15/1M output
      // 1M input = $3, 500K output = $7.5, total = $10.5
      expect(cost).toBeCloseTo(10.5, 2);
    });

    it('should calculate cost with custom model', () => {
      const cost = client.calculateCost(1_000_000, 1_000_000, 'claude-3-opus-20240229');

      // Opus: $15/1M input, $75/1M output
      // 1M input = $15, 1M output = $75, total = $90
      expect(cost).toBeCloseTo(90, 2);
    });

    it('should calculate cost for haiku model', () => {
      const cost = client.calculateCost(1_000_000, 1_000_000, 'claude-3-5-haiku-20241022');

      // Haiku 3.5: $0.8/1M input, $4/1M output
      // 1M input = $0.8, 1M output = $4, total = $4.8
      expect(cost).toBeCloseTo(4.8, 2);
    });

    it('should use default pricing for unknown model', () => {
      const cost = client.calculateCost(1_000_000, 1_000_000, 'unknown-model');

      // Uses Sonnet pricing as default: $3/1M input, $15/1M output
      // 1M input = $3, 1M output = $15, total = $18
      expect(cost).toBeCloseTo(18, 2);
    });

    it('should calculate small amounts correctly', () => {
      // 1000 tokens at Sonnet pricing
      const cost = client.calculateCost(1000, 500);

      // 1000 input = $0.003, 500 output = $0.0075, total = $0.0105
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('should return 0 for 0 tokens', () => {
      const cost = client.calculateCost(0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('MODEL_COSTS', () => {
    it('should have costs for all documented models', () => {
      expect(MODEL_COSTS['claude-sonnet-4-20250514']).toBeDefined();
      expect(MODEL_COSTS['claude-3-5-sonnet-20241022']).toBeDefined();
      expect(MODEL_COSTS['claude-3-5-haiku-20241022']).toBeDefined();
      expect(MODEL_COSTS['claude-3-opus-20240229']).toBeDefined();
      expect(MODEL_COSTS['claude-3-sonnet-20240229']).toBeDefined();
      expect(MODEL_COSTS['claude-3-haiku-20240307']).toBeDefined();
    });

    it('should have valid cost structure', () => {
      for (const [model, costs] of Object.entries(MODEL_COSTS)) {
        expect(costs.input).toBeGreaterThan(0);
        expect(costs.output).toBeGreaterThan(0);
        // Output typically costs more than input
        expect(costs.output).toBeGreaterThanOrEqual(costs.input);
      }
    });
  });
});
