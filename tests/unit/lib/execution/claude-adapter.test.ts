import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeAdapter, type ClaudeEvent } from '../../../../src/lib/execution/claude-adapter.js';
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('ClaudeAdapter', () => {
  let mockProcess: EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock process
    mockProcess = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    });

    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
  });

  describe('constructor', () => {
    it('should use default options', () => {
      const adapter = new ClaudeAdapter();
      expect(adapter).toBeDefined();
    });

    it('should accept custom options', () => {
      const adapter = new ClaudeAdapter({
        cliPath: '/usr/bin/claude',
        cwd: '/tmp',
        timeout: 60000,
        maxTokens: 8192,
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should spawn claude CLI with correct arguments', async () => {
      const adapter = new ClaudeAdapter();

      // Schedule the close event
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);

      await adapter.execute('test prompt');

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['--print', '--max-turns', '1', '-p', 'test prompt'],
        expect.objectContaining({
          shell: true,
        })
      );
    });

    it('should capture stdout', async () => {
      const adapter = new ClaudeAdapter();

      // Schedule output and close
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Hello '));
        mockProcess.stdout.emit('data', Buffer.from('World'));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await adapter.execute('test');

      expect(result.output).toBe('Hello World');
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should capture stderr', async () => {
      const adapter = new ClaudeAdapter();

      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Error occurred'));
        mockProcess.emit('close', 1);
      }, 10);

      const result = await adapter.execute('test');

      expect(result.error).toBe('Error occurred');
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle spawn errors', async () => {
      const adapter = new ClaudeAdapter();

      setTimeout(() => {
        mockProcess.emit('error', new Error('Spawn failed'));
      }, 10);

      const result = await adapter.execute('test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Spawn failed');
      expect(result.exitCode).toBe(-1);
    });

    it('should track duration', async () => {
      const adapter = new ClaudeAdapter();

      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 50);

      const result = await adapter.execute('test');

      expect(result.duration).toBeGreaterThanOrEqual(50);
    });

    it('should timeout if execution takes too long', async () => {
      const adapter = new ClaudeAdapter({ timeout: 50 });

      // Simulate slow process - it will close after kill
      mockProcess.kill.mockImplementation(() => {
        setTimeout(() => mockProcess.emit('close', -1), 5);
      });

      const result = await adapter.execute('test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution timed out');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should emit events', async () => {
      const adapter = new ClaudeAdapter();
      const events: ClaudeEvent[] = [];

      adapter.on('event', (e) => events.push(e));

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('output'));
        mockProcess.emit('close', 0);
      }, 10);

      await adapter.execute('test');

      expect(events).toContainEqual({ type: 'stdout', data: 'output' });
      expect(events).toContainEqual({ type: 'exit', exitCode: 0 });
    });
  });

  describe('executeStream', () => {
    it('should call callback on each chunk', async () => {
      const adapter = new ClaudeAdapter();
      const chunks: string[] = [];

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('chunk1'));
        mockProcess.stdout.emit('data', Buffer.from('chunk2'));
        mockProcess.emit('close', 0);
      }, 10);

      await adapter.executeStream('test', (chunk) => chunks.push(chunk));

      expect(chunks).toEqual(['chunk1', 'chunk2']);
    });
  });

  describe('abort', () => {
    it('should kill the process', async () => {
      const adapter = new ClaudeAdapter();

      // Start execution but don't complete
      const promise = adapter.execute('test');

      // Abort immediately
      adapter.abort();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Let the mock process close
      mockProcess.emit('close', -1);
      await promise;
    });

    it('should do nothing if not running', () => {
      const adapter = new ClaudeAdapter();
      expect(() => adapter.abort()).not.toThrow();
    });
  });

  describe('isRunning', () => {
    it('should return false when not executing', () => {
      const adapter = new ClaudeAdapter();
      expect(adapter.isRunning()).toBe(false);
    });

    it('should return true during execution', async () => {
      const adapter = new ClaudeAdapter();

      const promise = adapter.execute('test');
      expect(adapter.isRunning()).toBe(true);

      mockProcess.emit('close', 0);
      await promise;

      expect(adapter.isRunning()).toBe(false);
    });
  });

  describe('buildTaskPrompt', () => {
    it('should build prompt with task and criteria', () => {
      const prompt = ClaudeAdapter.buildTaskPrompt(
        'Create a new file',
        ['File exists', 'File has content']
      );

      expect(prompt).toContain('Create a new file');
      expect(prompt).toContain('File exists');
      expect(prompt).toContain('File has content');
    });

    it('should include context when provided', () => {
      const prompt = ClaudeAdapter.buildTaskPrompt(
        'Task',
        ['Criteria'],
        'Background info'
      );

      expect(prompt).toContain('Background info');
    });

    it('should number criteria', () => {
      const prompt = ClaudeAdapter.buildTaskPrompt('Task', [
        'First',
        'Second',
        'Third',
      ]);

      expect(prompt).toContain('1. First');
      expect(prompt).toContain('2. Second');
      expect(prompt).toContain('3. Third');
    });
  });

  describe('isAvailable', () => {
    it('should return true if claude is available', async () => {
      vi.mocked(spawn).mockReturnValue(
        (() => {
          const proc = new EventEmitter() as ChildProcess;
          setTimeout(() => proc.emit('close', 0), 10);
          return proc;
        })()
      );

      const result = await ClaudeAdapter.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false if claude is not available', async () => {
      vi.mocked(spawn).mockReturnValue(
        (() => {
          const proc = new EventEmitter() as ChildProcess;
          setTimeout(() => proc.emit('error', new Error('not found')), 10);
          return proc;
        })()
      );

      const result = await ClaudeAdapter.isAvailable();
      expect(result).toBe(false);
    });

    it('should return false for non-zero exit', async () => {
      vi.mocked(spawn).mockReturnValue(
        (() => {
          const proc = new EventEmitter() as ChildProcess;
          setTimeout(() => proc.emit('close', 1), 10);
          return proc;
        })()
      );

      const result = await ClaudeAdapter.isAvailable();
      expect(result).toBe(false);
    });
  });
});
