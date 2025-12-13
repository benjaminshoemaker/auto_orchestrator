import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTestTempDir } from '../../../helpers/temp-dir.js';
import { StateManager, StateEvent, StateEventType } from '../../../../src/lib/state/state-manager.js';
import { DocumentManager } from '../../../../src/lib/documents.js';
import { ImplementationPhase, Task } from '../../../../src/types/index.js';
import { createTaskResult } from '../../../../src/lib/task-results.js';

describe('StateManager', () => {
  let tempDir: string;
  let docManager: DocumentManager;
  let stateManager: StateManager;

  beforeEach(async () => {
    tempDir = await createTestTempDir('state-manager-test-');
    docManager = new DocumentManager(tempDir);
    await docManager.initialize('Test Project', 'A test project');

    // Add an implementation phase with tasks
    const phase: ImplementationPhase = {
      phase_number: 1,
      name: 'Foundation',
      description: 'Set up basics',
      status: 'pending',
      tasks: [
        {
          id: '1.1',
          description: 'Initialize project',
          status: 'pending',
          depends_on: [],
          acceptance_criteria: ['Project builds'],
        },
        {
          id: '1.2',
          description: 'Add config',
          status: 'pending',
          depends_on: ['1.1'],
          acceptance_criteria: ['Config loads'],
        },
        {
          id: '1.3',
          description: 'Create types',
          status: 'pending',
          depends_on: ['1.1'],
          acceptance_criteria: ['Types work'],
        },
      ],
    };
    await docManager.addImplementationPhase(phase);

    // Update meta to be in implementation phase
    await docManager.updateProjectMeta({
      current_phase: 'implementation',
      current_phase_name: 'Implementation',
      phase_status: 'in_progress',
      implementation: {
        total_phases: 1,
        completed_phases: 0,
        current_impl_phase: 1,
        current_impl_phase_name: 'Foundation',
      },
    });

    stateManager = new StateManager(docManager, tempDir);
    await stateManager.load();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('should load project document', async () => {
      const project = stateManager.getProject();
      expect(project.meta.project_name).toBe('Test Project');
    });

    it('should load task results', async () => {
      // Save a task result first
      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      await docManager.saveTaskResult(result);

      // Reload state
      await stateManager.load();

      const loaded = stateManager.getTaskResult('1.1');
      expect(loaded).not.toBeNull();
      expect(loaded?.status).toBe('success');
    });
  });

  describe('save', () => {
    it('should save when dirty', async () => {
      stateManager.startTask('1.1');
      await stateManager.save();

      // Reload and check
      const newManager = new StateManager(docManager, tempDir);
      await newManager.load();
      const task = newManager.getTask('1.1');
      expect(task?.status).toBe('in_progress');
    });

    it('should not save when not dirty', async () => {
      const spy = vi.spyOn(docManager, 'updateProjectMeta');
      await stateManager.save(); // No changes made
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('getProject', () => {
    it('should return project document', () => {
      const project = stateManager.getProject();
      expect(project).toBeDefined();
      expect(project.meta).toBeDefined();
    });

    it('should throw if not loaded', () => {
      const freshManager = new StateManager(docManager, tempDir);
      expect(() => freshManager.getProject()).toThrow('State not loaded');
    });
  });

  describe('getMeta', () => {
    it('should return meta', () => {
      const meta = stateManager.getMeta();
      expect(meta.project_name).toBe('Test Project');
    });
  });

  describe('getCurrentPhase', () => {
    it('should return current phase', () => {
      const phase = stateManager.getCurrentPhase();
      expect(phase).toBe('implementation');
    });
  });

  describe('getCurrentImplPhase', () => {
    it('should return current implementation phase', () => {
      const phase = stateManager.getCurrentImplPhase();
      expect(phase?.name).toBe('Foundation');
    });

    it('should return null if not in implementation', async () => {
      await docManager.updateProjectMeta({ current_phase: 1 });
      await stateManager.load();

      const phase = stateManager.getCurrentImplPhase();
      expect(phase).toBeNull();
    });
  });

  describe('getTask', () => {
    it('should find task by ID', () => {
      const task = stateManager.getTask('1.2');
      expect(task?.description).toBe('Add config');
    });

    it('should return null for non-existent task', () => {
      const task = stateManager.getTask('99.99');
      expect(task).toBeNull();
    });
  });

  describe('getAllTasks', () => {
    it('should return all tasks', () => {
      const tasks = stateManager.getAllTasks();
      expect(tasks).toHaveLength(3);
    });
  });

  describe('getNextTask', () => {
    it('should return first task with complete deps', () => {
      const task = stateManager.getNextTask();
      expect(task?.id).toBe('1.1'); // No dependencies
    });

    it('should return null when all tasks done', async () => {
      // Complete all tasks
      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      const result2 = createTaskResult('1.2', 'Test');
      result2.status = 'success';
      stateManager.startTask('1.2');
      stateManager.completeTask('1.2', result2);

      const result3 = createTaskResult('1.3', 'Test');
      result3.status = 'success';
      stateManager.startTask('1.3');
      stateManager.completeTask('1.3', result3);

      const next = stateManager.getNextTask();
      expect(next).toBeNull();
    });

    it('should respect dependencies', () => {
      // 1.2 depends on 1.1, so 1.1 should be next
      const next = stateManager.getNextTask();
      expect(next?.id).toBe('1.1');

      // Complete 1.1
      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      // Now 1.2 and 1.3 are available
      const next2 = stateManager.getNextTask();
      expect(['1.2', '1.3']).toContain(next2?.id);
    });
  });

  describe('getPendingTasks', () => {
    it('should return all pending tasks', () => {
      const pending = stateManager.getPendingTasks();
      expect(pending).toHaveLength(3);
    });
  });

  describe('getCompletedTasks', () => {
    it('should return completed tasks', () => {
      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      const completed = stateManager.getCompletedTasks();
      expect(completed).toHaveLength(1);
      expect(completed[0]?.id).toBe('1.1');
    });
  });

  describe('getFailedTasks', () => {
    it('should return failed tasks', () => {
      const result = createTaskResult('1.1', 'Test');
      result.status = 'failed';
      result.failure_reason = 'Test failed';
      stateManager.startTask('1.1');
      stateManager.failTask('1.1', result);

      const failed = stateManager.getFailedTasks();
      expect(failed).toHaveLength(1);
      expect(failed[0]?.id).toBe('1.1');
    });
  });

  describe('isTaskComplete', () => {
    it('should return true for complete task', () => {
      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      expect(stateManager.isTaskComplete('1.1')).toBe(true);
    });

    it('should return true for skipped task', () => {
      stateManager.skipTask('1.1', 'Not needed');
      expect(stateManager.isTaskComplete('1.1')).toBe(true);
    });

    it('should return false for pending task', () => {
      expect(stateManager.isTaskComplete('1.1')).toBe(false);
    });
  });

  describe('areAllDependenciesComplete', () => {
    it('should return true for task with no deps', () => {
      expect(stateManager.areAllDependenciesComplete('1.1')).toBe(true);
    });

    it('should return false when deps not complete', () => {
      expect(stateManager.areAllDependenciesComplete('1.2')).toBe(false);
    });

    it('should return true when deps complete', () => {
      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      expect(stateManager.areAllDependenciesComplete('1.2')).toBe(true);
    });
  });

  describe('startTask', () => {
    it('should set task to in_progress', () => {
      stateManager.startTask('1.1');
      const task = stateManager.getTask('1.1');
      expect(task?.status).toBe('in_progress');
    });

    it('should set started_at', () => {
      const before = new Date().toISOString();
      stateManager.startTask('1.1');
      const after = new Date().toISOString();

      const task = stateManager.getTask('1.1');
      expect(task?.started_at).toBeDefined();
      expect(task?.started_at! >= before).toBe(true);
      expect(task?.started_at! <= after).toBe(true);
    });

    it('should emit task_started event', () => {
      const handler = vi.fn();
      stateManager.on('task_started', handler);
      stateManager.startTask('1.1');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0]?.data.taskId).toBe('1.1');
    });

    it('should throw for non-existent task', () => {
      expect(() => stateManager.startTask('99.99')).toThrow('Task not found');
    });
  });

  describe('completeTask', () => {
    it('should set task to complete', () => {
      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      const task = stateManager.getTask('1.1');
      expect(task?.status).toBe('complete');
    });

    it('should store task result', () => {
      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      const stored = stateManager.getTaskResult('1.1');
      expect(stored).toBeDefined();
    });

    it('should emit task_completed event', () => {
      const handler = vi.fn();
      stateManager.on('task_completed', handler);

      const result = createTaskResult('1.1', 'Test');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('failTask', () => {
    it('should set task to failed', () => {
      const result = createTaskResult('1.1', 'Test');
      result.status = 'failed';
      result.failure_reason = 'Error';
      stateManager.startTask('1.1');
      stateManager.failTask('1.1', result);

      const task = stateManager.getTask('1.1');
      expect(task?.status).toBe('failed');
      expect(task?.failure_reason).toBe('Error');
    });

    it('should emit task_failed event', () => {
      const handler = vi.fn();
      stateManager.on('task_failed', handler);

      const result = createTaskResult('1.1', 'Test');
      result.status = 'failed';
      stateManager.startTask('1.1');
      stateManager.failTask('1.1', result);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('skipTask', () => {
    it('should set task to skipped', () => {
      stateManager.skipTask('1.1', 'Not needed');

      const task = stateManager.getTask('1.1');
      expect(task?.status).toBe('skipped');
      expect(task?.failure_reason).toBe('Not needed');
    });

    it('should emit task_skipped event', () => {
      const handler = vi.fn();
      stateManager.on('task_skipped', handler);
      stateManager.skipTask('1.1', 'Not needed');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryTask', () => {
    it('should reset failed task to pending', async () => {
      // Fail the task first
      const result = createTaskResult('1.1', 'Test');
      result.status = 'failed';
      stateManager.startTask('1.1');
      stateManager.failTask('1.1', result);

      // Retry
      await stateManager.retryTask('1.1');

      const task = stateManager.getTask('1.1');
      expect(task?.status).toBe('pending');
      expect(task?.started_at).toBeUndefined();
      expect(task?.failure_reason).toBeUndefined();
    });

    it('should delete task result', async () => {
      const result = createTaskResult('1.1', 'Test');
      result.status = 'failed';
      stateManager.startTask('1.1');
      stateManager.failTask('1.1', result);

      await stateManager.retryTask('1.1');

      const stored = stateManager.getTaskResult('1.1');
      expect(stored).toBeNull();
    });

    it('should throw if task not failed', async () => {
      await expect(stateManager.retryTask('1.1')).rejects.toThrow('not in failed state');
    });

    it('should emit task_retried event', async () => {
      const handler = vi.fn();
      stateManager.on('task_retried', handler);

      const result = createTaskResult('1.1', 'Test');
      result.status = 'failed';
      stateManager.startTask('1.1');
      stateManager.failTask('1.1', result);
      await stateManager.retryTask('1.1');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('approvePhase', () => {
    it('should add approval', () => {
      stateManager.approvePhase('Phase 1', 'Looks good');
      const project = stateManager.getProject();
      const approval = project.approvals.find((a) => a.phase === 'Phase 1');
      expect(approval?.status).toBe('approved');
      expect(approval?.notes).toBe('Looks good');
    });

    it('should update gates for Phase 1', () => {
      stateManager.approvePhase('Phase 1');
      const meta = stateManager.getMeta();
      expect(meta.gates.ideation_approved).toBe(true);
    });

    it('should update gates for Phase 2', () => {
      stateManager.approvePhase('Phase 2');
      const meta = stateManager.getMeta();
      expect(meta.gates.spec_approved).toBe(true);
    });

    it('should emit approval_added event', () => {
      const handler = vi.fn();
      stateManager.on('approval_added', handler);
      stateManager.approvePhase('Phase 1');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('setIdeationContent', () => {
    it('should set ideation and mark complete', () => {
      stateManager.setIdeationContent({
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1'],
        success_criteria: ['SC1'],
        constraints: { must_have: [], nice_to_have: [], out_of_scope: [] },
        raw_content: '',
      });

      const project = stateManager.getProject();
      expect(project.ideation?.problem_statement).toBe('Problem');
      expect(project.meta.gates.ideation_complete).toBe(true);
    });
  });

  describe('addImplementationPhases', () => {
    it('should add phases and mark planning complete', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 2,
          name: 'Phase Two',
          description: 'Second phase',
          status: 'pending',
          tasks: [],
        },
      ];

      stateManager.addImplementationPhases(phases);

      const project = stateManager.getProject();
      expect(project.implementation_phases).toHaveLength(2);
      expect(project.meta.gates.planning_complete).toBe(true);
    });
  });

  describe('cost tracking', () => {
    it('should accumulate cost', () => {
      stateManager.addCost(1000, 0.05);
      stateManager.addCost(2000, 0.10);

      const cost = stateManager.getTotalCost();
      expect(cost.tokens).toBe(3000);
      expect(cost.cost).toBeCloseTo(0.15);
    });

    it('should emit cost_updated event', () => {
      const handler = vi.fn();
      stateManager.on('cost_updated', handler);
      stateManager.addCost(1000, 0.05);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('events', () => {
    it('should allow registering handlers', () => {
      const handler = vi.fn();
      stateManager.on('task_started', handler);
      stateManager.startTask('1.1');
      expect(handler).toHaveBeenCalled();
    });

    it('should allow removing handlers', () => {
      const handler = vi.fn();
      stateManager.on('task_started', handler);
      stateManager.off('task_started', handler);
      stateManager.startTask('1.1');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should continue if handler throws', () => {
      const badHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      stateManager.on('task_started', badHandler);
      stateManager.on('task_started', goodHandler);

      expect(() => stateManager.startTask('1.1')).not.toThrow();
      expect(goodHandler).toHaveBeenCalled();
    });
  });
});
