import { describe, it, expect } from 'vitest';
import { DependencyResolver } from '../../../../src/lib/state/dependency-resolver.js';
import { Task } from '../../../../src/types/index.js';

const createTask = (id: string, depends_on: string[] = [], status: Task['status'] = 'pending'): Task => ({
  id,
  description: `Task ${id}`,
  status,
  depends_on,
  acceptance_criteria: [],
});

describe('DependencyResolver', () => {
  describe('validate', () => {
    it('should pass for valid linear dependencies', () => {
      const tasks = [
        createTask('1.1'),
        createTask('1.2', ['1.1']),
        createTask('1.3', ['1.2']),
      ];

      const resolver = new DependencyResolver(tasks);
      const result = resolver.validate();

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect missing dependencies', () => {
      const tasks = [
        createTask('1.1'),
        createTask('1.2', ['nonexistent']),
      ];

      const resolver = new DependencyResolver(tasks);
      const result = resolver.validate();

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.type).toBe('missing');
      expect(result.issues[0]?.taskId).toBe('1.2');
    });

    it('should detect self-reference', () => {
      const tasks = [
        createTask('1.1', ['1.1']),
      ];

      const resolver = new DependencyResolver(tasks);
      const result = resolver.validate();

      expect(result.valid).toBe(false);
      // Self-reference is detected as both self_reference and circular
      const selfRefIssues = result.issues.filter((i) => i.type === 'self_reference');
      expect(selfRefIssues).toHaveLength(1);
      expect(selfRefIssues[0]?.taskId).toBe('1.1');
    });

    it('should detect circular dependencies', () => {
      const tasks = [
        createTask('1.1', ['1.3']),
        createTask('1.2', ['1.1']),
        createTask('1.3', ['1.2']),
      ];

      const resolver = new DependencyResolver(tasks);
      const result = resolver.validate();

      expect(result.valid).toBe(false);
      const circularIssues = result.issues.filter((i) => i.type === 'circular');
      expect(circularIssues.length).toBeGreaterThan(0);
    });

    it('should pass for tasks with no dependencies', () => {
      const tasks = [
        createTask('1.1'),
        createTask('1.2'),
        createTask('1.3'),
      ];

      const resolver = new DependencyResolver(tasks);
      const result = resolver.validate();

      expect(result.valid).toBe(true);
    });

    it('should pass for diamond dependencies', () => {
      // A
      // |\
      // B C
      // |/
      // D
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A']),
        createTask('D', ['B', 'C']),
      ];

      const resolver = new DependencyResolver(tasks);
      const result = resolver.validate();

      expect(result.valid).toBe(true);
    });
  });

  describe('canRun', () => {
    it('should return true for task with no deps', () => {
      const tasks = [createTask('1.1')];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.canRun('1.1')).toBe(true);
    });

    it('should return false for task with incomplete deps', () => {
      const tasks = [
        createTask('1.1'),
        createTask('1.2', ['1.1']),
      ];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.canRun('1.2')).toBe(false);
    });

    it('should return true for task with complete deps', () => {
      const tasks = [
        createTask('1.1', [], 'complete'),
        createTask('1.2', ['1.1']),
      ];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.canRun('1.2')).toBe(true);
    });

    it('should return true for task with skipped deps', () => {
      const tasks = [
        createTask('1.1', [], 'skipped'),
        createTask('1.2', ['1.1']),
      ];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.canRun('1.2')).toBe(true);
    });

    it('should return false for non-pending task', () => {
      const tasks = [createTask('1.1', [], 'in_progress')];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.canRun('1.1')).toBe(false);
    });

    it('should return false for non-existent task', () => {
      const tasks = [createTask('1.1')];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.canRun('99.99')).toBe(false);
    });
  });

  describe('getBlockingDeps', () => {
    it('should return empty for task with no deps', () => {
      const tasks = [createTask('1.1')];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.getBlockingDeps('1.1')).toEqual([]);
    });

    it('should return incomplete deps', () => {
      const tasks = [
        createTask('1.1'),
        createTask('1.2'),
        createTask('1.3', ['1.1', '1.2']),
      ];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.getBlockingDeps('1.3')).toEqual(['1.1', '1.2']);
    });

    it('should exclude complete deps', () => {
      const tasks = [
        createTask('1.1', [], 'complete'),
        createTask('1.2'),
        createTask('1.3', ['1.1', '1.2']),
      ];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.getBlockingDeps('1.3')).toEqual(['1.2']);
    });

    it('should return empty for non-existent task', () => {
      const tasks = [createTask('1.1')];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.getBlockingDeps('99.99')).toEqual([]);
    });
  });

  describe('getNextRunnable', () => {
    it('should return first runnable task', () => {
      const tasks = [
        createTask('1.1'),
        createTask('1.2', ['1.1']),
      ];
      const resolver = new DependencyResolver(tasks);

      const next = resolver.getNextRunnable();
      expect(next?.id).toBe('1.1');
    });

    it('should return null when no tasks runnable', () => {
      const tasks = [
        createTask('1.1', [], 'complete'),
        createTask('1.2', [], 'complete'),
      ];
      const resolver = new DependencyResolver(tasks);

      expect(resolver.getNextRunnable()).toBeNull();
    });

    it('should skip completed tasks', () => {
      const tasks = [
        createTask('1.1', [], 'complete'),
        createTask('1.2', ['1.1']),
      ];
      const resolver = new DependencyResolver(tasks);

      const next = resolver.getNextRunnable();
      expect(next?.id).toBe('1.2');
    });

    it('should return tasks in ID order', () => {
      const tasks = [
        createTask('2.1'),
        createTask('1.2'),
        createTask('1.1'),
      ];
      const resolver = new DependencyResolver(tasks);

      const next = resolver.getNextRunnable();
      expect(next?.id).toBe('1.1');
    });

    it('should handle partial completion', () => {
      const tasks = [
        createTask('1.1', [], 'complete'),
        createTask('1.2', ['1.1'], 'in_progress'),
        createTask('1.3', ['1.1']),
      ];
      const resolver = new DependencyResolver(tasks);

      const next = resolver.getNextRunnable();
      expect(next?.id).toBe('1.3');
    });
  });

  describe('getExecutionOrder', () => {
    it('should return tasks in valid order', () => {
      const tasks = [
        createTask('1.2', ['1.1']),
        createTask('1.1'),
        createTask('1.3', ['1.2']),
      ];
      const resolver = new DependencyResolver(tasks);

      const order = resolver.getExecutionOrder();
      const ids = order.map((t) => t.id);

      // 1.1 must come before 1.2, 1.2 must come before 1.3
      expect(ids.indexOf('1.1')).toBeLessThan(ids.indexOf('1.2'));
      expect(ids.indexOf('1.2')).toBeLessThan(ids.indexOf('1.3'));
    });

    it('should handle diamond dependencies', () => {
      const tasks = [
        createTask('D', ['B', 'C']),
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A']),
      ];
      const resolver = new DependencyResolver(tasks);

      const order = resolver.getExecutionOrder();
      const ids = order.map((t) => t.id);

      // A must come first, then B and C, then D
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
      expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
      expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'));
    });

    it('should throw for cycles', () => {
      const tasks = [
        createTask('1.1', ['1.2']),
        createTask('1.2', ['1.1']),
      ];
      const resolver = new DependencyResolver(tasks);

      expect(() => resolver.getExecutionOrder()).toThrow('circular');
    });

    it('should handle independent tasks', () => {
      const tasks = [
        createTask('1.3'),
        createTask('1.1'),
        createTask('1.2'),
      ];
      const resolver = new DependencyResolver(tasks);

      const order = resolver.getExecutionOrder();
      const ids = order.map((t) => t.id);

      // All tasks should be present
      expect(ids).toContain('1.1');
      expect(ids).toContain('1.2');
      expect(ids).toContain('1.3');
    });
  });

  describe('findCycles', () => {
    it('should find simple cycle', () => {
      const tasks = [
        createTask('A', ['B']),
        createTask('B', ['A']),
      ];
      const resolver = new DependencyResolver(tasks);

      const cycles = resolver.findCycles();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should find longer cycle', () => {
      const tasks = [
        createTask('A', ['C']),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];
      const resolver = new DependencyResolver(tasks);

      const cycles = resolver.findCycles();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should return empty for acyclic graph', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];
      const resolver = new DependencyResolver(tasks);

      const cycles = resolver.findCycles();
      expect(cycles).toHaveLength(0);
    });

    it('should not find cycle in diamond', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A']),
        createTask('D', ['B', 'C']),
      ];
      const resolver = new DependencyResolver(tasks);

      const cycles = resolver.findCycles();
      expect(cycles).toHaveLength(0);
    });
  });

  describe('complex scenarios', () => {
    it('should handle real-world task structure', () => {
      const tasks = [
        createTask('1.1'),
        createTask('1.2', ['1.1']),
        createTask('1.3', ['1.1']),
        createTask('2.1', ['1.2', '1.3']),
        createTask('2.2', ['2.1']),
        createTask('2.3', ['2.1']),
        createTask('3.1', ['2.2', '2.3']),
      ];
      const resolver = new DependencyResolver(tasks);

      // Should be valid
      const validation = resolver.validate();
      expect(validation.valid).toBe(true);

      // Execution order should respect all dependencies
      const order = resolver.getExecutionOrder();
      const ids = order.map((t) => t.id);

      expect(ids.indexOf('1.1')).toBeLessThan(ids.indexOf('1.2'));
      expect(ids.indexOf('1.1')).toBeLessThan(ids.indexOf('1.3'));
      expect(ids.indexOf('1.2')).toBeLessThan(ids.indexOf('2.1'));
      expect(ids.indexOf('1.3')).toBeLessThan(ids.indexOf('2.1'));
      expect(ids.indexOf('2.1')).toBeLessThan(ids.indexOf('2.2'));
      expect(ids.indexOf('2.1')).toBeLessThan(ids.indexOf('2.3'));
      expect(ids.indexOf('2.2')).toBeLessThan(ids.indexOf('3.1'));
      expect(ids.indexOf('2.3')).toBeLessThan(ids.indexOf('3.1'));
    });

    it('should handle empty task list', () => {
      const resolver = new DependencyResolver([]);

      expect(resolver.validate().valid).toBe(true);
      expect(resolver.getNextRunnable()).toBeNull();
      expect(resolver.getExecutionOrder()).toEqual([]);
      expect(resolver.findCycles()).toEqual([]);
    });
  });
});
