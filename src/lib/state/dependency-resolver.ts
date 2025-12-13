import { Task } from '../../types/index.js';

/**
 * Types of dependency issues that can be detected
 */
export interface DependencyIssue {
  type: 'missing' | 'circular' | 'self_reference';
  taskId: string;
  details: string;
}

/**
 * Result of dependency validation
 */
export interface DependencyValidationResult {
  valid: boolean;
  issues: DependencyIssue[];
}

/**
 * Resolver for task dependencies
 * Handles validation, topological sorting, and cycle detection
 */
export class DependencyResolver {
  private taskMap: Map<string, Task>;

  constructor(private tasks: Task[]) {
    this.taskMap = new Map(tasks.map((t) => [t.id, t]));
  }

  /**
   * Validate the dependency graph
   * Checks for missing refs, self-refs, and cycles
   */
  validate(): DependencyValidationResult {
    const issues: DependencyIssue[] = [];

    // Check each task's dependencies
    for (const task of this.tasks) {
      // Check for self-reference
      if (task.depends_on.includes(task.id)) {
        issues.push({
          type: 'self_reference',
          taskId: task.id,
          details: `Task ${task.id} depends on itself`,
        });
      }

      // Check for missing dependencies
      for (const depId of task.depends_on) {
        if (!this.taskMap.has(depId)) {
          issues.push({
            type: 'missing',
            taskId: task.id,
            details: `Task ${task.id} depends on non-existent task ${depId}`,
          });
        }
      }
    }

    // Check for cycles
    const cycles = this.findCycles();
    for (const cycle of cycles) {
      issues.push({
        type: 'circular',
        taskId: cycle[0] || '',
        details: `Circular dependency: ${cycle.join(' → ')} → ${cycle[0]}`,
      });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Check if a task can run (is pending and all deps complete)
   */
  canRun(taskId: string): boolean {
    const task = this.taskMap.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status !== 'pending') {
      return false;
    }

    return this.areAllDepsComplete(taskId);
  }

  /**
   * Get incomplete dependencies for a task
   */
  getBlockingDeps(taskId: string): string[] {
    const task = this.taskMap.get(taskId);
    if (!task) {
      return [];
    }

    const blocking: string[] = [];
    for (const depId of task.depends_on) {
      const dep = this.taskMap.get(depId);
      if (dep && dep.status !== 'complete' && dep.status !== 'skipped') {
        blocking.push(depId);
      }
    }

    return blocking;
  }

  /**
   * Get next task that can run
   * Returns first pending task with all deps complete
   */
  getNextRunnable(): Task | null {
    // Sort tasks by ID for deterministic order
    const sorted = [...this.tasks].sort((a, b) => this.compareTaskIds(a.id, b.id));

    for (const task of sorted) {
      if (this.canRun(task.id)) {
        return task;
      }
    }

    return null;
  }

  /**
   * Get all tasks in topological order
   * Throws if cycle detected
   */
  getExecutionOrder(): Task[] {
    const cycles = this.findCycles();
    if (cycles.length > 0) {
      throw new Error(`Cannot determine execution order: circular dependencies detected`);
    }

    return this.topologicalSort();
  }

  /**
   * Find all cycles in the dependency graph
   * Uses DFS with coloring (white/gray/black)
   */
  findCycles(): string[][] {
    const cycles: string[][] = [];
    const WHITE = 0; // Not visited
    const GRAY = 1; // Being visited (in current path)
    const BLACK = 2; // Finished

    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();

    // Initialize all nodes as white
    for (const task of this.tasks) {
      color.set(task.id, WHITE);
      parent.set(task.id, null);
    }

    const dfs = (taskId: string, path: string[]): void => {
      color.set(taskId, GRAY);
      path.push(taskId);

      const task = this.taskMap.get(taskId);
      if (task) {
        for (const depId of task.depends_on) {
          const depColor = color.get(depId);

          if (depColor === GRAY) {
            // Found a cycle - extract it from current path
            const cycleStart = path.indexOf(depId);
            if (cycleStart >= 0) {
              const cycle = path.slice(cycleStart);
              cycles.push(cycle);
            }
          } else if (depColor === WHITE && this.taskMap.has(depId)) {
            dfs(depId, [...path]);
          }
        }
      }

      color.set(taskId, BLACK);
    };

    // Run DFS from each unvisited node
    for (const task of this.tasks) {
      if (color.get(task.id) === WHITE) {
        dfs(task.id, []);
      }
    }

    return cycles;
  }

  /**
   * Check if all dependencies for a task are complete
   */
  private areAllDepsComplete(taskId: string): boolean {
    const task = this.taskMap.get(taskId);
    if (!task) {
      return false;
    }

    for (const depId of task.depends_on) {
      const dep = this.taskMap.get(depId);
      if (!dep || (dep.status !== 'complete' && dep.status !== 'skipped')) {
        return false;
      }
    }

    return true;
  }

  /**
   * Kahn's algorithm for topological sort
   */
  private topologicalSort(): Task[] {
    const result: Task[] = [];
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize in-degree and adjacency list
    for (const task of this.tasks) {
      inDegree.set(task.id, 0);
      adjacency.set(task.id, []);
    }

    // Build the graph
    // A depends on B means edge from B to A
    for (const task of this.tasks) {
      for (const depId of task.depends_on) {
        if (this.taskMap.has(depId)) {
          // Add edge from depId to task.id
          const adj = adjacency.get(depId) || [];
          adj.push(task.id);
          adjacency.set(depId, adj);

          // Increment in-degree of task.id
          inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        }
      }
    }

    // Find all nodes with in-degree 0
    const queue: string[] = [];
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    // Sort queue for deterministic order
    queue.sort((a, b) => this.compareTaskIds(a, b));

    // Process queue
    while (queue.length > 0) {
      const taskId = queue.shift()!;
      const task = this.taskMap.get(taskId);
      if (task) {
        result.push(task);
      }

      // Reduce in-degree for all dependent tasks
      const dependents = adjacency.get(taskId) || [];
      for (const depId of dependents) {
        const newDegree = (inDegree.get(depId) || 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          // Add to queue in sorted position
          queue.push(depId);
          queue.sort((a, b) => this.compareTaskIds(a, b));
        }
      }
    }

    return result;
  }

  /**
   * Compare task IDs for sorting (e.g., "1.1" < "1.2" < "2.1")
   */
  private compareTaskIds(a: string, b: string): number {
    const [aMajor, aMinor] = a.split('.').map(Number);
    const [bMajor, bMinor] = b.split('.').map(Number);

    if ((aMajor || 0) !== (bMajor || 0)) {
      return (aMajor || 0) - (bMajor || 0);
    }
    return (aMinor || 0) - (bMinor || 0);
  }
}
