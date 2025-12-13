import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationHandler, ConversationOptions } from '../../../../src/lib/llm/conversation.js';
import {
  AnthropicClient,
  CompletionResponse,
  StreamEvent,
} from '../../../../src/lib/llm/anthropic-client.js';

// Create mock AnthropicClient
const createMockClient = () => {
  return {
    chat: vi.fn(),
    streamChat: vi.fn(),
    calculateCost: vi.fn(),
    getModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
  } as unknown as AnthropicClient;
};

// Helper to create mock response
const createMockResponse = (
  content: string,
  inputTokens: number = 10,
  outputTokens: number = 20
): CompletionResponse => ({
  content,
  model: 'claude-sonnet-4-20250514',
  stopReason: 'end_turn',
  inputTokens,
  outputTokens,
});

describe('ConversationHandler', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let handler: ConversationHandler;

  beforeEach(() => {
    mockClient = createMockClient();
    handler = new ConversationHandler(mockClient as unknown as AnthropicClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create handler with default options', () => {
      const handler = new ConversationHandler(mockClient as unknown as AnthropicClient);
      expect(handler.getHistory()).toEqual([]);
      expect(handler.getSystemPrompt()).toBeUndefined();
    });

    it('should create handler with custom options', () => {
      const options: ConversationOptions = {
        systemPrompt: 'You are helpful',
        maxTurns: 10,
        temperature: 0.7,
      };

      const handler = new ConversationHandler(
        mockClient as unknown as AnthropicClient,
        options
      );
      expect(handler.getSystemPrompt()).toBe('You are helpful');
    });
  });

  describe('send', () => {
    it('should send message and return response', async () => {
      vi.mocked(mockClient.chat).mockResolvedValue(
        createMockResponse('Hello!', 15, 5)
      );

      const response = await handler.send('Hi there');

      expect(response).toBe('Hello!');
      expect(mockClient.chat).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Hi there' }],
        expect.objectContaining({
          systemPrompt: undefined,
        })
      );
    });

    it('should track conversation history', async () => {
      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('Response 1'));

      await handler.send('Message 1');

      const history = handler.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.role).toBe('user');
      expect(history[0]?.content).toBe('Message 1');
      expect(history[1]?.role).toBe('assistant');
      expect(history[1]?.content).toBe('Response 1');
    });

    it('should maintain multi-turn conversation', async () => {
      vi.mocked(mockClient.chat)
        .mockResolvedValueOnce(createMockResponse('First response'))
        .mockResolvedValueOnce(createMockResponse('Second response'));

      await handler.send('First message');
      await handler.send('Second message');

      const history = handler.getHistory();
      expect(history).toHaveLength(4);

      // Second call should include full history
      expect(mockClient.chat).toHaveBeenLastCalledWith(
        [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
          { role: 'user', content: 'Second message' },
        ],
        expect.any(Object)
      );
    });

    it('should use system prompt', async () => {
      const handler = new ConversationHandler(
        mockClient as unknown as AnthropicClient,
        { systemPrompt: 'Be concise' }
      );

      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('OK'));

      await handler.send('Test');

      expect(mockClient.chat).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          systemPrompt: 'Be concise',
        })
      );
    });

    it('should throw when max turns exceeded', async () => {
      const handler = new ConversationHandler(
        mockClient as unknown as AnthropicClient,
        { maxTurns: 1 }
      );

      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('OK'));

      await handler.send('First');

      await expect(handler.send('Second')).rejects.toThrow('Maximum turns (1) reached');
    });

    it('should track token usage', async () => {
      vi.mocked(mockClient.chat)
        .mockResolvedValueOnce(createMockResponse('R1', 100, 50))
        .mockResolvedValueOnce(createMockResponse('R2', 200, 75));

      await handler.send('M1');
      await handler.send('M2');

      const usage = handler.getTokenUsage();
      expect(usage.totalInputTokens).toBe(300);
      expect(usage.totalOutputTokens).toBe(125);
      expect(usage.totalTokens).toBe(425);
      expect(usage.turnCount).toBe(2);
    });
  });

  describe('sendStreaming', () => {
    it('should yield text chunks', async () => {
      async function* mockStream(): AsyncGenerator<StreamEvent> {
        yield { type: 'message_start', inputTokens: 10 };
        yield { type: 'content_block_delta', text: 'Hello' };
        yield { type: 'content_block_delta', text: ' World' };
        yield { type: 'message_delta', outputTokens: 5 };
        yield { type: 'message_stop' };
      }

      vi.mocked(mockClient.streamChat).mockReturnValue(mockStream());

      const chunks: string[] = [];
      for await (const chunk of handler.sendStreaming('Hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' World']);
    });

    it('should update history after streaming', async () => {
      async function* mockStream(): AsyncGenerator<StreamEvent> {
        yield { type: 'message_start', inputTokens: 20 };
        yield { type: 'content_block_delta', text: 'Streamed' };
        yield { type: 'content_block_delta', text: ' response' };
        yield { type: 'message_delta', outputTokens: 10 };
        yield { type: 'message_stop' };
      }

      vi.mocked(mockClient.streamChat).mockReturnValue(mockStream());

      // Consume the stream
      for await (const _ of handler.sendStreaming('Test')) {
        // consume
      }

      const history = handler.getHistory();
      expect(history).toHaveLength(2);
      expect(history[1]?.content).toBe('Streamed response');
      expect(history[1]?.inputTokens).toBe(20);
      expect(history[1]?.outputTokens).toBe(10);
    });

    it('should track tokens from streaming', async () => {
      async function* mockStream(): AsyncGenerator<StreamEvent> {
        yield { type: 'message_start', inputTokens: 50 };
        yield { type: 'content_block_delta', text: 'Response' };
        yield { type: 'message_delta', outputTokens: 25 };
        yield { type: 'message_stop' };
      }

      vi.mocked(mockClient.streamChat).mockReturnValue(mockStream());

      for await (const _ of handler.sendStreaming('Test')) {
        // consume
      }

      const usage = handler.getTokenUsage();
      expect(usage.totalInputTokens).toBe(50);
      expect(usage.totalOutputTokens).toBe(25);
    });
  });

  describe('addMessage', () => {
    it('should add user message to history', () => {
      handler.addMessage('user', 'Injected user message');

      const history = handler.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.role).toBe('user');
      expect(history[0]?.content).toBe('Injected user message');
    });

    it('should add assistant message to history', () => {
      handler.addMessage('assistant', 'Injected response');

      const history = handler.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.role).toBe('assistant');
      expect(history[0]?.content).toBe('Injected response');
    });

    it('should be included in subsequent calls', async () => {
      handler.addMessage('user', 'Previous context');
      handler.addMessage('assistant', 'I understand');

      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('New response'));

      await handler.send('New message');

      expect(mockClient.chat).toHaveBeenCalledWith(
        [
          { role: 'user', content: 'Previous context' },
          { role: 'assistant', content: 'I understand' },
          { role: 'user', content: 'New message' },
        ],
        expect.any(Object)
      );
    });
  });

  describe('getLastResponse', () => {
    it('should return null for empty history', () => {
      expect(handler.getLastResponse()).toBeNull();
    });

    it('should return last assistant message', async () => {
      vi.mocked(mockClient.chat)
        .mockResolvedValueOnce(createMockResponse('First'))
        .mockResolvedValueOnce(createMockResponse('Second'));

      await handler.send('M1');
      await handler.send('M2');

      expect(handler.getLastResponse()).toBe('Second');
    });

    it('should skip user messages', () => {
      handler.addMessage('assistant', 'Response');
      handler.addMessage('user', 'New question');

      expect(handler.getLastResponse()).toBe('Response');
    });
  });

  describe('getLastUserMessage', () => {
    it('should return null for empty history', () => {
      expect(handler.getLastUserMessage()).toBeNull();
    });

    it('should return last user message', () => {
      handler.addMessage('user', 'First');
      handler.addMessage('assistant', 'Response');
      handler.addMessage('user', 'Second');

      expect(handler.getLastUserMessage()).toBe('Second');
    });
  });

  describe('clear', () => {
    it('should clear history', async () => {
      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('Response'));

      await handler.send('Test');
      handler.clear();

      expect(handler.getHistory()).toHaveLength(0);
    });

    it('should reset token counts', async () => {
      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('R', 100, 50));

      await handler.send('Test');
      handler.clear();

      const usage = handler.getTokenUsage();
      expect(usage.totalInputTokens).toBe(0);
      expect(usage.totalOutputTokens).toBe(0);
    });
  });

  describe('setSystemPrompt', () => {
    it('should update system prompt', () => {
      handler.setSystemPrompt('New prompt');
      expect(handler.getSystemPrompt()).toBe('New prompt');
    });

    it('should use new prompt in subsequent calls', async () => {
      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('OK'));

      handler.setSystemPrompt('Updated prompt');
      await handler.send('Test');

      expect(mockClient.chat).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          systemPrompt: 'Updated prompt',
        })
      );
    });
  });

  describe('fork', () => {
    it('should create new handler with partial history', async () => {
      vi.mocked(mockClient.chat)
        .mockResolvedValueOnce(createMockResponse('R1', 10, 5))
        .mockResolvedValueOnce(createMockResponse('R2', 20, 10));

      await handler.send('M1');
      await handler.send('M2');

      // Fork after first turn (index 1 = first assistant response)
      const forked = handler.fork(1);

      expect(forked.getHistory()).toHaveLength(2);
      expect(forked.getHistory()[1]?.content).toBe('R1');
    });

    it('should preserve system prompt', () => {
      const handler = new ConversationHandler(
        mockClient as unknown as AnthropicClient,
        { systemPrompt: 'System' }
      );
      handler.addMessage('user', 'Test');

      const forked = handler.fork(0);
      expect(forked.getSystemPrompt()).toBe('System');
    });

    it('should throw for invalid index', () => {
      handler.addMessage('user', 'Test');

      expect(() => handler.fork(-1)).toThrow('Invalid turn index');
      expect(() => handler.fork(5)).toThrow('Invalid turn index');
    });

    it('should track forked token usage', async () => {
      vi.mocked(mockClient.chat)
        .mockResolvedValueOnce(createMockResponse('R1', 100, 50))
        .mockResolvedValueOnce(createMockResponse('R2', 200, 100));

      await handler.send('M1');
      await handler.send('M2');

      const forked = handler.fork(1);
      const usage = forked.getTokenUsage();

      // Should only have tokens from first turn
      expect(usage.totalInputTokens).toBe(100);
      expect(usage.totalOutputTokens).toBe(50);
    });
  });

  describe('export/import', () => {
    it('should export conversation state', async () => {
      const handler = new ConversationHandler(
        mockClient as unknown as AnthropicClient,
        { systemPrompt: 'Be helpful' }
      );

      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('Response', 50, 25));

      await handler.send('Message');

      const exported = handler.export();

      expect(exported.systemPrompt).toBe('Be helpful');
      expect(exported.history).toHaveLength(2);
      expect(exported.tokenUsage.totalInputTokens).toBe(50);
      expect(exported.tokenUsage.totalOutputTokens).toBe(25);
    });

    it('should import conversation state', () => {
      const data = {
        systemPrompt: 'Imported system',
        history: [
          { role: 'user' as const, content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
          {
            role: 'assistant' as const,
            content: 'Hi',
            timestamp: '2024-01-01T00:00:01Z',
            inputTokens: 10,
            outputTokens: 5,
          },
        ],
        tokenUsage: {
          totalInputTokens: 10,
          totalOutputTokens: 5,
          totalTokens: 15,
          turnCount: 1,
        },
      };

      handler.import(data);

      expect(handler.getSystemPrompt()).toBe('Imported system');
      expect(handler.getHistory()).toHaveLength(2);
      expect(handler.getTokenUsage().totalInputTokens).toBe(10);
    });

    it('should recalculate tokens if not provided', () => {
      const data = {
        history: [
          { role: 'user' as const, content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
          {
            role: 'assistant' as const,
            content: 'Hi',
            timestamp: '2024-01-01T00:00:01Z',
            inputTokens: 30,
            outputTokens: 15,
          },
        ],
      };

      handler.import(data);

      const usage = handler.getTokenUsage();
      expect(usage.totalInputTokens).toBe(30);
      expect(usage.totalOutputTokens).toBe(15);
    });
  });

  describe('calculateCost', () => {
    it('should delegate to client', async () => {
      vi.mocked(mockClient.chat).mockResolvedValue(createMockResponse('R', 1000, 500));
      vi.mocked(mockClient.calculateCost).mockReturnValue(0.012);

      await handler.send('Test');
      const cost = handler.calculateCost();

      expect(mockClient.calculateCost).toHaveBeenCalledWith(1000, 500);
      expect(cost).toBe(0.012);
    });
  });
});
