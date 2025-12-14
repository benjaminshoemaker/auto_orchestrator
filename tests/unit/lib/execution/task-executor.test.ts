import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TaskExecutor,
  type TaskExecutionEvent,
} from '../../../../src/lib/execution/task-executor.js';
import type { Task } from '../../../../src/types/index.js';

// Mock the ClaudeAdapter
vi.mock('../../../../src/lib/execution/claude-adapter.js', () => ({
  ClaudeAdapter: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: 'Task validated',
      exitCode: 0,
      duration: 1000,
    }),
    executeStream: vi.fn().mockImplementation((_prompt, callback) => {
      callback('Output chunk');
      return Promise.resolve({
        success: true,
        output: `## Task Complete
### Files Modified
- src/index.ts: main file
### Acceptance Criteria Status
1. [PASS] Criterion met`,
        exitCode: 0,
        duration: 5000,
      });
    }),
    abort: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
  })),
}));

// Mock terminal
vi.mock('../../../../src/lib/ui/terminal.js', () => ({
  printInfo: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printWarning: vi.fn(),
}));

import { ClaudeAdapter } from '../../../../src/lib/execution/claude-adapter.js';
import * as terminal from '../../../../src/lib/ui/terminal.js';

describe('TaskExecutor', () => {
  const sampleTask: Task = {
    id: '1.1',
    description: 'Create project structure',
    acceptance_criteria: ['Files exist', 'Config valid'],
    depends_on: [],
    status: 'pending',
  };

  const context = {
    projectName: 'test-project',
    phaseName: 'Setup',
    phaseNumber: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create executor with default options', () => {
      const executor = new TaskExecutor(context);
      expect(executor).toBeDefined();
    });

    it('should accept custom options', () => {
      const executor = new TaskExecutor(context, {
        timeout: 60000,
        validateResults: false,
        maxRetries: 3,
      });
      expect(executor).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute task and return result', async () => {
      const executor = new TaskExecutor(context, { validateResults: false });
      const result = await executor.execute(sampleTask);

      expect(result.task_id).toBe('1.1');
      expect(result.status).toBe('complete');
    });

    it('should call ClaudeAdapter.executeStream', async () => {
      const executor = new TaskExecutor(context);
      await executor.execute(sampleTask);

      const mockAdapter = vi.mocked(ClaudeAdapter).mock.results[0].value;
      expect(mockAdapter.executeStream).toHaveBeenCalled();
    });

    it('should emit events during execution', async () => {
      const executor = new TaskExecutor(context, { validateResults: false });
      const events: TaskExecutionEvent[] = [];

      executor.on('event', (e) => events.push(e));

      await executor.execute(sampleTask);

      expect(events.some((e) => e.type === 'start')).toBe(true);
      expect(events.some((e) => e.type === 'progress')).toBe(true);
      expect(events.some((e) => e.type === 'complete')).toBe(true);
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();
      const executor = new TaskExecutor(context, { onProgress });

      await executor.execute(sampleTask);

      expect(onProgress).toHaveBeenCalled();
    });

    it('should print success on completion', async () => {
      const executor = new TaskExecutor(context, { validateResults: false });
      await executor.execute(sampleTask);

      expect(terminal.printSuccess).toHaveBeenCalledWith(
        expect.stringContaining('1.1')
      );
    });

    it('should handle failed execution', async () => {
      const mockAdapter = {
        executeStream: vi.fn().mockResolvedValue({
          success: false,
          output: 'Error: Something went wrong',
          exitCode: 1,
          duration: 1000,
        }),
        execute: vi.fn().mockResolvedValue({ output: '' }),
        abort: vi.fn(),
        isRunning: vi.fn(),
      };
      vi.mocked(ClaudeAdapter).mockImplementationOnce(() => mockAdapter as any);

      const executor = new TaskExecutor(context, { validateResults: false });
      const result = await executor.execute(sampleTask);

      expect(result.status).toBe('failed');
      expect(terminal.printError).toHaveBeenCalled();
    });
  });

  describe('executeWithRetry', () => {
    it('should return on first success', async () => {
      const executor = new TaskExecutor(context, { validateResults: false });
      const result = await executor.executeWithRetry(sampleTask);

      expect(result.status).toBe('complete');
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const mockAdapter = {
        executeStream: vi.fn().mockImplementation(() => {
          attempts++;
          if (attempts === 1) {
            return Promise.resolve({
              success: false,
              output: 'First attempt failed',
              exitCode: 1,
              duration: 1000,
            });
          }
          return Promise.resolve({
            success: true,
            output: '## Task Complete\n1. [PASS] Done',
            exitCode: 0,
            duration: 2000,
          });
        }),
        execute: vi.fn().mockResolvedValue({ output: 'Status: PASS' }),
        abort: vi.fn(),
        isRunning: vi.fn(),
      };
      vi.mocked(ClaudeAdapter).mockImplementationOnce(() => mockAdapter as any);

      const executor = new TaskExecutor(context, { maxRetries: 2 });
      const result = await executor.executeWithRetry(sampleTask);

      expect(result.status).toBe('complete');
      expect(attempts).toBe(2);
    });

    it('should emit retry events', async () => {
      let attempts = 0;
      const mockAdapter = {
        executeStream: vi.fn().mockImplementation(() => {
          attempts++;
          if (attempts === 1) {
            return Promise.resolve({
              success: false,
              output: 'Failed',
              exitCode: 1,
              duration: 1000,
            });
          }
          return Promise.resolve({
            success: true,
            output: '## Task Complete\n1. [PASS] Done',
            exitCode: 0,
            duration: 2000,
          });
        }),
        execute: vi.fn().mockResolvedValue({ output: 'Status: PASS' }),
        abort: vi.fn(),
        isRunning: vi.fn(),
      };
      vi.mocked(ClaudeAdapter).mockImplementationOnce(() => mockAdapter as any);

      const executor = new TaskExecutor(context);
      const events: TaskExecutionEvent[] = [];
      executor.on('event', (e) => events.push(e));

      await executor.executeWithRetry(sampleTask);

      expect(events.some((e) => e.type === 'retry')).toBe(true);
    });

    it('should fail after max retries', async () => {
      const mockAdapter = {
        executeStream: vi.fn().mockResolvedValue({
          success: false,
          output: 'Always fails',
          exitCode: 1,
          duration: 1000,
        }),
        execute: vi.fn().mockResolvedValue({ output: '' }),
        abort: vi.fn(),
        isRunning: vi.fn(),
      };
      vi.mocked(ClaudeAdapter).mockImplementationOnce(() => mockAdapter as any);

      const executor = new TaskExecutor(context, {
        maxRetries: 1,
        validateResults: false,
      });
      const result = await executor.executeWithRetry(sampleTask);

      expect(result.status).toBe('failed');
      expect(mockAdapter.executeStream).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
  });

  describe('validate', () => {
    it('should call validation prompt', async () => {
      const executor = new TaskExecutor(context);

      const mockAdapter = vi.mocked(ClaudeAdapter).mock.results[0].value;
      mockAdapter.execute.mockResolvedValueOnce({
        success: true,
        output: 'Status: PASS\n### Summary\nLooks good',
        exitCode: 0,
        duration: 1000,
      });

      const result = await executor.validate(sampleTask, 'execution output');

      expect(result.passed).toBe(true);
      expect(mockAdapter.execute).toHaveBeenCalled();
    });
  });

  describe('abort', () => {
    it('should call adapter abort', () => {
      const executor = new TaskExecutor(context);
      executor.abort();

      const mockAdapter = vi.mocked(ClaudeAdapter).mock.results[0].value;
      expect(mockAdapter.abort).toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('should return adapter running state', () => {
      const executor = new TaskExecutor(context);

      const mockAdapter = vi.mocked(ClaudeAdapter).mock.results[0].value;
      mockAdapter.isRunning.mockReturnValue(true);

      expect(executor.isRunning()).toBe(true);
    });
  });
});
