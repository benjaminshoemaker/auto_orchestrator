import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskResult } from '../types/index.js';
import { DocumentParseError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Type guard to validate TaskResult structure
 */
export function isValidTaskResult(obj: unknown): obj is TaskResult {
  if (!obj || typeof obj !== 'object') return false;

  const result = obj as Record<string, unknown>;

  // Required: task_id must be a string
  if (typeof result['task_id'] !== 'string') return false;

  // Optional string fields - check type if present
  const optionalStrings = [
    'task_description',
    'started_at',
    'completed_at',
    'summary',
    'output_summary',
    'raw_output',
    'test_output',
    'failure_reason',
    'commit_hash',
  ];
  for (const field of optionalStrings) {
    if (result[field] !== undefined && typeof result[field] !== 'string') return false;
  }

  // Status must be 'complete' or 'failed'
  if (result.status !== 'complete' && result.status !== 'failed') return false;

  // Optional number fields - check type if present
  const optionalNumbers = [
    'duration_ms',
    'tests_added',
    'tests_passing',
    'tests_failing',
    'tokens_used',
    'cost_usd',
  ];
  for (const field of optionalNumbers) {
    if (result[field] !== undefined && typeof result[field] !== 'number') return false;
  }

  // Optional arrays - check type if present
  const optionalArrays = [
    'files_created',
    'files_modified',
    'files_deleted',
    'key_decisions',
    'assumptions',
    'acceptance_criteria',
  ];
  for (const field of optionalArrays) {
    if (result[field] !== undefined && !Array.isArray(result[field])) return false;
  }

  // Validation is optional - but check structure if present
  if (result.validation !== undefined) {
    if (typeof result.validation !== 'object') return false;
    const validation = result.validation as Record<string, unknown>;
    if (typeof validation.passed !== 'boolean') return false;
    if (typeof validation.validator_output !== 'string') return false;
    if (typeof validation.criteria_checked !== 'number') return false;
    if (typeof validation.criteria_passed !== 'number') return false;
  }

  return true;
}

/**
 * Create a new TaskResult with default values
 */
export function createTaskResult(taskId: string, taskDescription: string): TaskResult {
  const now = new Date().toISOString();

  return {
    task_id: taskId,
    task_description: taskDescription,
    status: 'failed', // Must be explicitly set to success
    started_at: now,
    completed_at: now,
    duration_ms: 0,
    summary: '',
    files_created: [],
    files_modified: [],
    files_deleted: [],
    key_decisions: [],
    assumptions: [],
    tests_added: 0,
    tests_passing: 0,
    tests_failing: 0,
    acceptance_criteria: [],
    validation: {
      passed: false,
      validator_output: '',
      criteria_checked: 0,
      criteria_passed: 0,
    },
    tokens_used: 0,
    cost_usd: 0,
  };
}

/**
 * Manager for task result JSON files in tasks/results/
 */
export class TaskResultManager {
  private resultsDir: string;

  constructor(private projectDir: string) {
    this.resultsDir = path.join(projectDir, 'tasks', 'results');
  }

  /**
   * Get the file path for a task result
   * Task ID "2.3" → "task-2.3.json"
   */
  getResultPath(taskId: string): string {
    return path.join(this.resultsDir, `task-${taskId}.json`);
  }

  /**
   * Write a task result to JSON file
   */
  async writeResult(result: TaskResult): Promise<void> {
    if (!isValidTaskResult(result)) {
      throw DocumentParseError.invalidStructure('Invalid TaskResult structure');
    }

    // Ensure directory exists
    await fs.mkdir(this.resultsDir, { recursive: true });

    const filePath = this.getResultPath(result.task_id);
    const content = JSON.stringify(result, null, 2);

    await fs.writeFile(filePath, content, 'utf-8');
    logger.debug(`Wrote task result: ${filePath}`);
  }

  /**
   * Read a task result from JSON file
   * Returns null if file doesn't exist
   */
  async readResult(taskId: string): Promise<TaskResult | null> {
    const filePath = this.getResultPath(taskId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as unknown;

      if (!isValidTaskResult(data)) {
        throw DocumentParseError.invalidStructure(
          `Invalid task result structure in ${filePath}`
        );
      }

      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if a result file exists
   */
  async resultExists(taskId: string): Promise<boolean> {
    const filePath = this.getResultPath(taskId);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read all task results from the results directory
   * Returns sorted by task ID
   */
  async readAllResults(): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    try {
      const files = await fs.readdir(this.resultsDir);

      for (const file of files) {
        if (!file.endsWith('.json') || !file.startsWith('task-')) {
          continue;
        }

        const filePath = path.join(this.resultsDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as unknown;

          if (isValidTaskResult(data)) {
            results.push(data);
          } else {
            logger.warn(`Skipping invalid task result: ${file}`);
          }
        } catch (error) {
          logger.warn(`Failed to parse task result ${file}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Results directory doesn't exist yet
        return [];
      }
      throw error;
    }

    // Sort by task ID (e.g., "1.1", "1.2", "2.1")
    results.sort((a, b) => {
      const [aMajor, aMinor] = a.task_id.split('.').map(Number);
      const [bMajor, bMinor] = b.task_id.split('.').map(Number);

      if (aMajor !== bMajor) {
        return (aMajor || 0) - (bMajor || 0);
      }
      return (aMinor || 0) - (bMinor || 0);
    });

    return results;
  }

  /**
   * Delete a task result file
   * Returns true if deleted, false if didn't exist
   */
  async deleteResult(taskId: string): Promise<boolean> {
    const filePath = this.getResultPath(taskId);

    try {
      await fs.unlink(filePath);
      logger.debug(`Deleted task result: ${filePath}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get total cost from all task results
   */
  async getTotalCost(): Promise<number> {
    const results = await this.readAllResults();
    return results.reduce((sum, result) => sum + (result.cost_usd || 0), 0);
  }

  /**
   * Get total tokens from all task results
   */
  async getTotalTokens(): Promise<number> {
    const results = await this.readAllResults();
    return results.reduce((sum, result) => sum + (result.tokens_used || 0), 0);
  }
}
