import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TaskResultManager,
  isValidTaskResult,
  createTaskResult,
} from '../../../src/lib/task-results.js';
import { TaskResult } from '../../../src/types/index.js';

describe('Task Result Manager', () => {
  let tempDir: string;
  let manager: TaskResultManager;

  beforeEach(async () => {
    // Create temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-results-test-'));
    manager = new TaskResultManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isValidTaskResult', () => {
    it('should return true for valid result', () => {
      const result = createTaskResult('1.1', 'Test task');
      expect(isValidTaskResult(result)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidTaskResult(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidTaskResult('string')).toBe(false);
      expect(isValidTaskResult(123)).toBe(false);
    });

    it('should return false for missing required string fields', () => {
      const result = createTaskResult('1.1', 'Test');
      delete (result as Record<string, unknown>).task_id;
      expect(isValidTaskResult(result)).toBe(false);
    });

    it('should return false for invalid status', () => {
      const result = createTaskResult('1.1', 'Test');
      (result as Record<string, unknown>).status = 'invalid';
      expect(isValidTaskResult(result)).toBe(false);
    });

    it('should return false for missing required number fields', () => {
      const result = createTaskResult('1.1', 'Test');
      delete (result as Record<string, unknown>).duration_seconds;
      expect(isValidTaskResult(result)).toBe(false);
    });

    it('should return false for missing required arrays', () => {
      const result = createTaskResult('1.1', 'Test');
      delete (result as Record<string, unknown>).files_created;
      expect(isValidTaskResult(result)).toBe(false);
    });

    it('should return false for missing validation object', () => {
      const result = createTaskResult('1.1', 'Test');
      delete (result as Record<string, unknown>).validation;
      expect(isValidTaskResult(result)).toBe(false);
    });

    it('should return false for invalid validation object', () => {
      const result = createTaskResult('1.1', 'Test');
      (result as Record<string, unknown>).validation = { passed: 'not boolean' };
      expect(isValidTaskResult(result)).toBe(false);
    });
  });

  describe('createTaskResult', () => {
    it('should create result with task_id and description', () => {
      const result = createTaskResult('2.3', 'Implement feature');

      expect(result.task_id).toBe('2.3');
      expect(result.task_description).toBe('Implement feature');
    });

    it('should default status to failed', () => {
      const result = createTaskResult('1.1', 'Test');
      expect(result.status).toBe('failed');
    });

    it('should set timestamps to now', () => {
      const before = new Date().toISOString();
      const result = createTaskResult('1.1', 'Test');
      const after = new Date().toISOString();

      expect(result.started_at >= before).toBe(true);
      expect(result.started_at <= after).toBe(true);
      expect(result.completed_at >= before).toBe(true);
      expect(result.completed_at <= after).toBe(true);
    });

    it('should initialize empty arrays', () => {
      const result = createTaskResult('1.1', 'Test');

      expect(result.files_created).toEqual([]);
      expect(result.files_modified).toEqual([]);
      expect(result.files_deleted).toEqual([]);
      expect(result.key_decisions).toEqual([]);
      expect(result.assumptions).toEqual([]);
      expect(result.acceptance_criteria).toEqual([]);
    });

    it('should initialize zero counts', () => {
      const result = createTaskResult('1.1', 'Test');

      expect(result.duration_seconds).toBe(0);
      expect(result.tests_added).toBe(0);
      expect(result.tests_passing).toBe(0);
      expect(result.tests_failing).toBe(0);
      expect(result.tokens_used).toBe(0);
      expect(result.cost_usd).toBe(0);
    });

    it('should initialize validation with defaults', () => {
      const result = createTaskResult('1.1', 'Test');

      expect(result.validation).toEqual({
        passed: false,
        validator_output: '',
        criteria_checked: 0,
        criteria_passed: 0,
      });
    });
  });

  describe('getResultPath', () => {
    it('should generate correct path for task ID', () => {
      const resultPath = manager.getResultPath('1.1');

      expect(resultPath).toBe(path.join(tempDir, 'tasks', 'results', 'task-1.1.json'));
    });

    it('should handle task IDs with different formats', () => {
      expect(manager.getResultPath('2.3')).toContain('task-2.3.json');
      expect(manager.getResultPath('10.15')).toContain('task-10.15.json');
    });
  });

  describe('writeResult', () => {
    it('should create JSON file', async () => {
      const result = createTaskResult('1.1', 'Test task');
      result.status = 'success';

      await manager.writeResult(result);

      const filePath = manager.getResultPath('1.1');
      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should write valid JSON', async () => {
      const result = createTaskResult('1.1', 'Test task');
      result.status = 'success';
      result.summary = 'Task completed successfully';
      result.files_created = ['src/test.ts'];

      await manager.writeResult(result);

      const filePath = manager.getResultPath('1.1');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content) as TaskResult;

      expect(parsed.task_id).toBe('1.1');
      expect(parsed.status).toBe('success');
      expect(parsed.summary).toBe('Task completed successfully');
      expect(parsed.files_created).toEqual(['src/test.ts']);
    });

    it('should create directory if not exists', async () => {
      const result = createTaskResult('1.1', 'Test');

      await manager.writeResult(result);

      const dirPath = path.join(tempDir, 'tasks', 'results');
      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should throw for invalid result', async () => {
      const invalid = { task_id: '1.1' } as TaskResult;

      await expect(manager.writeResult(invalid)).rejects.toThrow();
    });
  });

  describe('readResult', () => {
    it('should read and parse result', async () => {
      const original = createTaskResult('1.1', 'Test task');
      original.status = 'success';
      original.summary = 'Done';

      await manager.writeResult(original);

      const result = await manager.readResult('1.1');

      expect(result).not.toBeNull();
      expect(result?.task_id).toBe('1.1');
      expect(result?.status).toBe('success');
      expect(result?.summary).toBe('Done');
    });

    it('should return null for missing file', async () => {
      const result = await manager.readResult('nonexistent');
      expect(result).toBeNull();
    });

    it('should throw for invalid JSON structure', async () => {
      // Create directory and write invalid JSON
      const resultsDir = path.join(tempDir, 'tasks', 'results');
      await fs.mkdir(resultsDir, { recursive: true });
      const filePath = path.join(resultsDir, 'task-bad.json');
      await fs.writeFile(filePath, JSON.stringify({ invalid: true }), 'utf-8');

      await expect(manager.readResult('bad')).rejects.toThrow('Invalid task result structure');
    });
  });

  describe('resultExists', () => {
    it('should return true for existing result', async () => {
      const result = createTaskResult('1.1', 'Test');
      await manager.writeResult(result);

      expect(await manager.resultExists('1.1')).toBe(true);
    });

    it('should return false for non-existing result', async () => {
      expect(await manager.resultExists('1.1')).toBe(false);
    });
  });

  describe('readAllResults', () => {
    it('should read all result files', async () => {
      await manager.writeResult(createTaskResult('1.1', 'Task 1'));
      await manager.writeResult(createTaskResult('1.2', 'Task 2'));
      await manager.writeResult(createTaskResult('2.1', 'Task 3'));

      const results = await manager.readAllResults();

      expect(results).toHaveLength(3);
    });

    it('should sort by task ID', async () => {
      await manager.writeResult(createTaskResult('2.1', 'Task'));
      await manager.writeResult(createTaskResult('1.2', 'Task'));
      await manager.writeResult(createTaskResult('1.1', 'Task'));

      const results = await manager.readAllResults();

      expect(results[0]?.task_id).toBe('1.1');
      expect(results[1]?.task_id).toBe('1.2');
      expect(results[2]?.task_id).toBe('2.1');
    });

    it('should return empty array if no results', async () => {
      const results = await manager.readAllResults();
      expect(results).toEqual([]);
    });

    it('should skip non-json files', async () => {
      await manager.writeResult(createTaskResult('1.1', 'Task'));

      // Create a non-json file
      const resultsDir = path.join(tempDir, 'tasks', 'results');
      await fs.writeFile(path.join(resultsDir, 'readme.txt'), 'ignore me');

      const results = await manager.readAllResults();
      expect(results).toHaveLength(1);
    });

    it('should skip invalid result files with warning', async () => {
      await manager.writeResult(createTaskResult('1.1', 'Task'));

      // Create an invalid JSON result
      const resultsDir = path.join(tempDir, 'tasks', 'results');
      await fs.writeFile(
        path.join(resultsDir, 'task-bad.json'),
        JSON.stringify({ invalid: true })
      );

      const results = await manager.readAllResults();
      expect(results).toHaveLength(1);
      expect(results[0]?.task_id).toBe('1.1');
    });
  });

  describe('deleteResult', () => {
    it('should delete existing result', async () => {
      await manager.writeResult(createTaskResult('1.1', 'Task'));

      const deleted = await manager.deleteResult('1.1');

      expect(deleted).toBe(true);
      expect(await manager.resultExists('1.1')).toBe(false);
    });

    it('should return false for non-existing result', async () => {
      const deleted = await manager.deleteResult('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('getTotalCost', () => {
    it('should sum costs from all results', async () => {
      const result1 = createTaskResult('1.1', 'Task 1');
      result1.cost_usd = 0.05;
      const result2 = createTaskResult('1.2', 'Task 2');
      result2.cost_usd = 0.10;
      const result3 = createTaskResult('2.1', 'Task 3');
      result3.cost_usd = 0.15;

      await manager.writeResult(result1);
      await manager.writeResult(result2);
      await manager.writeResult(result3);

      const total = await manager.getTotalCost();
      expect(total).toBeCloseTo(0.30);
    });

    it('should return 0 if no results', async () => {
      const total = await manager.getTotalCost();
      expect(total).toBe(0);
    });
  });

  describe('getTotalTokens', () => {
    it('should sum tokens from all results', async () => {
      const result1 = createTaskResult('1.1', 'Task 1');
      result1.tokens_used = 1000;
      const result2 = createTaskResult('1.2', 'Task 2');
      result2.tokens_used = 2000;
      const result3 = createTaskResult('2.1', 'Task 3');
      result3.tokens_used = 3000;

      await manager.writeResult(result1);
      await manager.writeResult(result2);
      await manager.writeResult(result3);

      const total = await manager.getTotalTokens();
      expect(total).toBe(6000);
    });

    it('should return 0 if no results', async () => {
      const total = await manager.getTotalTokens();
      expect(total).toBe(0);
    });
  });

  describe('complete workflow', () => {
    it('should handle full task result lifecycle', async () => {
      // Create result
      const result = createTaskResult('3.2', 'Implement user authentication');
      result.status = 'success';
      result.summary = 'Added JWT authentication with refresh tokens';
      result.files_created = ['src/auth/jwt.ts', 'src/auth/middleware.ts'];
      result.files_modified = ['src/routes/index.ts'];
      result.key_decisions = [
        { decision: 'Use RS256 algorithm', rationale: 'More secure for distributed systems' },
      ];
      result.assumptions = ['Redis available for token blacklist'];
      result.tests_added = 5;
      result.tests_passing = 5;
      result.acceptance_criteria = [
        { criterion: 'JWT generation works', met: true },
        { criterion: 'Token refresh works', met: true, notes: 'Added 7-day expiry' },
      ];
      result.validation = {
        passed: true,
        validator_output: 'All criteria met',
        criteria_checked: 2,
        criteria_passed: 2,
      };
      result.tokens_used = 5000;
      result.cost_usd = 0.025;
      result.duration_seconds = 180;

      // Write
      await manager.writeResult(result);

      // Read back
      const read = await manager.readResult('3.2');
      expect(read).toEqual(result);

      // Check totals
      expect(await manager.getTotalCost()).toBe(0.025);
      expect(await manager.getTotalTokens()).toBe(5000);

      // Delete for retry
      expect(await manager.deleteResult('3.2')).toBe(true);
      expect(await manager.resultExists('3.2')).toBe(false);
    });
  });
});
