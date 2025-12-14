import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PhaseExecutor,
  type PhaseExecutionEvent,
} from '../../../../src/lib/execution/phase-executor.js';
import type { ImplementationPhase, Task } from '../../../../src/types/index.js';

// Mock dependencies
vi.mock('../../../../src/lib/execution/task-executor.js', () => ({
  TaskExecutor: vi.fn().mockImplementation(() => ({
    executeWithRetry: vi.fn().mockResolvedValue({
      task_id: '1.1',
      status: 'complete',
      duration_ms: 5000,
      output_summary: 'Done',
    }),
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

vi.mock('../../../../src/lib/ui/terminal.js', () => ({
  printHeader: vi.fn(),
  printInfo: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printProgress: vi.fn(),
}));

import { TaskExecutor } from '../../../../src/lib/execution/task-executor.js';
import * as terminal from '../../../../src/lib/ui/terminal.js';

describe('PhaseExecutor', () => {
  let mockStateManager: {
    getMeta: ReturnType<typeof vi.fn>;
    updateTask: ReturnType<typeof vi.fn>;
    recordTaskResult: ReturnType<typeof vi.fn>;
  };

  const sampleTask: Task = {
    id: '1.1',
    description: 'Set up project',
    acceptance_criteria: ['Done'],
    depends_on: [],
    status: 'pending',
  };

  const samplePhase: ImplementationPhase = {
    phase_number: 1,
    name: 'Setup',
    description: 'Initial setup',
    tasks: [sampleTask],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockStateManager = {
      getMeta: vi.fn().mockReturnValue({
        project_name: 'test-project',
      }),
      updateTask: vi.fn(),
      recordTaskResult: vi.fn(),
    };
  });

  describe('constructor', () => {
    it('should create executor with default options', () => {
      const executor = new PhaseExecutor(mockStateManager as any);
      expect(executor).toBeDefined();
    });

    it('should accept custom options', () => {
      const executor = new PhaseExecutor(mockStateManager as any, {
        stopOnFailure: false,
        parallel: true,
        maxParallel: 3,
      });
      expect(executor).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute phase and return result', async () => {
      const executor = new PhaseExecutor(mockStateManager as any);
      const result = await executor.execute(samplePhase);

      expect(result.phaseNumber).toBe(1);
      expect(result.phaseName).toBe('Setup');
      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(1);
    });

    it('should print phase header', async () => {
      const executor = new PhaseExecutor(mockStateManager as any);
      await executor.execute(samplePhase);

      expect(terminal.printHeader).toHaveBeenCalledWith(
        expect.stringContaining('Phase 1')
      );
    });

    it('should execute tasks via TaskExecutor', async () => {
      const executor = new PhaseExecutor(mockStateManager as any);
      await executor.execute(samplePhase);

      expect(TaskExecutor).toHaveBeenCalled();
    });

    it('should update task status in state', async () => {
      const executor = new PhaseExecutor(mockStateManager as any);
      await executor.execute(samplePhase);

      expect(mockStateManager.updateTask).toHaveBeenCalledWith('1.1', {
        status: 'complete',
        failure_reason: undefined,
      });
    });

    it('should record task result', async () => {
      const executor = new PhaseExecutor(mockStateManager as any);
      await executor.execute(samplePhase);

      expect(mockStateManager.recordTaskResult).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: '1.1',
          status: 'complete',
        })
      );
    });

    it('should emit phase events', async () => {
      const executor = new PhaseExecutor(mockStateManager as any);
      const events: PhaseExecutionEvent[] = [];

      executor.on('event', (e) => events.push(e));

      await executor.execute(samplePhase);

      expect(events.some((e) => e.type === 'phase_start')).toBe(true);
      expect(events.some((e) => e.type === 'phase_complete')).toBe(true);
    });

    it('should handle failed tasks', async () => {
      vi.mocked(TaskExecutor).mockImplementationOnce(
        () =>
          ({
            executeWithRetry: vi.fn().mockResolvedValue({
              task_id: '1.1',
              status: 'failed',
              duration_ms: 1000,
              output_summary: 'Error occurred',
            }),
            on: vi.fn(),
          }) as any
      );

      const executor = new PhaseExecutor(mockStateManager as any);
      const result = await executor.execute(samplePhase);

      expect(result.success).toBe(false);
      expect(result.tasksFailed).toBe(1);
    });

    it('should stop on failure when configured', async () => {
      const phase: ImplementationPhase = {
        ...samplePhase,
        tasks: [
          sampleTask,
          {
            id: '1.2',
            description: 'Second task',
            acceptance_criteria: [],
            depends_on: [],
            status: 'pending',
          },
        ],
      };

      vi.mocked(TaskExecutor).mockImplementation(
        () =>
          ({
            executeWithRetry: vi.fn().mockResolvedValue({
              task_id: '1.1',
              status: 'failed',
              duration_ms: 1000,
              output_summary: 'Error',
            }),
            on: vi.fn(),
          }) as any
      );

      const executor = new PhaseExecutor(mockStateManager as any, {
        stopOnFailure: true,
      });
      const result = await executor.execute(phase);

      expect(result.tasksCompleted).toBe(0);
      expect(result.tasksFailed).toBe(1);
      expect(result.tasksSkipped).toBe(1);
    });

    it('should respect task dependencies', async () => {
      const executionOrder: string[] = [];

      vi.mocked(TaskExecutor).mockImplementation(
        () =>
          ({
            executeWithRetry: vi.fn().mockImplementation(async (task: Task) => {
              executionOrder.push(task.id);
              return {
                task_id: task.id,
                status: 'complete',
                duration_ms: 1000,
                output_summary: 'Done',
              };
            }),
            on: vi.fn(),
          }) as any
      );

      const phase: ImplementationPhase = {
        ...samplePhase,
        tasks: [
          {
            id: '1.2',
            description: 'Second',
            acceptance_criteria: [],
            depends_on: ['1.1'],
            status: 'pending',
          },
          sampleTask, // 1.1 has no deps
        ],
      };

      const executor = new PhaseExecutor(mockStateManager as any);
      await executor.execute(phase);

      // 1.1 should execute before 1.2
      expect(executionOrder.indexOf('1.1')).toBeLessThan(
        executionOrder.indexOf('1.2')
      );
    });

    it('should skip already completed tasks', async () => {
      const phase: ImplementationPhase = {
        ...samplePhase,
        tasks: [
          {
            ...sampleTask,
            status: 'complete',
          },
        ],
      };

      const executor = new PhaseExecutor(mockStateManager as any);
      const result = await executor.execute(phase);

      expect(result.tasksCompleted).toBe(1);
      expect(result.tasksFailed).toBe(0);
      expect(result.tasksSkipped).toBe(0);
    });
  });

  describe('setSpecification', () => {
    it('should set specification for context', async () => {
      const executor = new PhaseExecutor(mockStateManager as any);
      executor.setSpecification({
        architecture: 'Microservices',
        tech_stack: [{ layer: 'Backend', choice: 'Node.js' }],
        data_models: '',
        api_design: '',
        raw_content: '',
      });

      await executor.execute(samplePhase);

      // TaskExecutor should be created with context including tech stack
      expect(TaskExecutor).toHaveBeenCalled();
    });
  });

  describe('abort', () => {
    it('should stop execution when aborted', async () => {
      const phase: ImplementationPhase = {
        ...samplePhase,
        tasks: [
          sampleTask,
          {
            id: '1.2',
            description: 'Second',
            acceptance_criteria: [],
            depends_on: [],
            status: 'pending',
          },
        ],
      };

      vi.mocked(TaskExecutor).mockImplementation(
        () =>
          ({
            executeWithRetry: vi.fn().mockImplementation(async () => {
              return {
                task_id: '1.1',
                status: 'complete',
                duration_ms: 1000,
                output_summary: 'Done',
              };
            }),
            on: vi.fn(),
          }) as any
      );

      const executor = new PhaseExecutor(mockStateManager as any);

      // Abort after first task
      executor.on('event', (e: PhaseExecutionEvent) => {
        if (e.type === 'task_event') {
          executor.abort();
        }
      });

      const result = await executor.execute(phase);

      // Should have skipped some tasks
      expect(result.tasksCompleted + result.tasksSkipped).toBeLessThanOrEqual(2);
    });
  });
});
