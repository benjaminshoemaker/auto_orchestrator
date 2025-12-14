import { describe, it, expect } from 'vitest';
import {
  parseTaskOutput,
  parseValidationOutput,
  toTaskResult,
} from '../../../../src/lib/execution/result-parser.js';

describe('Result Parser', () => {
  describe('parseTaskOutput', () => {
    it('should detect success from "Task Complete" marker', () => {
      const output = `
## Task Complete
The task has been completed successfully.
      `;

      const result = parseTaskOutput(output);
      expect(result.success).toBe(true);
    });

    it('should extract files modified', () => {
      const output = `
## Task Complete
### Files Modified
- src/index.ts: Added main function
- src/utils.ts: Created utility helpers
      `;

      const result = parseTaskOutput(output);
      expect(result.filesModified).toHaveLength(2);
      expect(result.filesModified[0].path).toBe('src/index.ts');
      expect(result.filesModified[0].description).toBe('Added main function');
    });

    it('should extract files from prose', () => {
      const output = `
I created src/app.ts with the main application logic.
I also modified src/config.ts to add settings.
      `;

      const result = parseTaskOutput(output);
      expect(result.filesModified).toContainEqual(
        expect.objectContaining({ path: 'src/app.ts' })
      );
      expect(result.filesModified).toContainEqual(
        expect.objectContaining({ path: 'src/config.ts' })
      );
    });

    it('should extract tests info', () => {
      const output = `
### Tests
All 15 tests passing
Added unit tests for new functionality
      `;

      const result = parseTaskOutput(output);
      expect(result.testsInfo).toContain('tests');
    });

    it('should extract criteria status with PASS/FAIL', () => {
      const output = `
### Acceptance Criteria Status
1. [PASS] Package.json exists - File was created
2. [PASS] TypeScript configured - tsconfig.json added
3. [FAIL] Tests pass - One test failing
      `;

      const result = parseTaskOutput(output);
      expect(result.criteriaStatus).toHaveLength(3);
      expect(result.criteriaStatus[0].passed).toBe(true);
      expect(result.criteriaStatus[2].passed).toBe(false);
      expect(result.criteriaStatus[2].reason).toBe('One test failing');
    });

    it('should extract criteria status with checkmarks', () => {
      const output = `
✓ First criterion met
✓ Second criterion met
✗ Third criterion failed
      `;

      const result = parseTaskOutput(output);
      expect(result.criteriaStatus).toContainEqual(
        expect.objectContaining({ passed: true })
      );
      expect(result.criteriaStatus).toContainEqual(
        expect.objectContaining({ passed: false })
      );
    });

    it('should determine success from criteria', () => {
      const outputAllPass = `
1. [PASS] First
2. [PASS] Second
      `;

      const outputOneFail = `
1. [PASS] First
2. [FAIL] Second
      `;

      expect(parseTaskOutput(outputAllPass).success).toBe(true);
      expect(parseTaskOutput(outputOneFail).success).toBe(false);
    });

    it('should extract summary', () => {
      const output = `
Did some work

### Summary
Successfully set up the project structure with all required files.
      `;

      const result = parseTaskOutput(output);
      expect(result.summary).toContain('Successfully set up');
    });

    it('should detect errors in output', () => {
      const output = `
Error: Module not found
Could not compile src/index.ts
      `;

      const result = parseTaskOutput(output);
      expect(result.success).toBe(false);
    });

    it('should include raw output', () => {
      const output = 'Some output text';
      const result = parseTaskOutput(output);
      expect(result.raw).toBe(output);
    });
  });

  describe('parseValidationOutput', () => {
    it('should detect PASS status', () => {
      const output = `
## Validation Result
Status: PASS

### Criteria Status
1. [PASS] All good

### Summary
Task completed successfully.
      `;

      const result = parseValidationOutput(output);
      expect(result.passed).toBe(true);
    });

    it('should detect FAIL status', () => {
      const output = `
## Validation Result
Status: FAIL

### Criteria Status
1. [FAIL] Missing file

### Summary
Task incomplete.
      `;

      const result = parseValidationOutput(output);
      expect(result.passed).toBe(false);
    });

    it('should extract criteria status', () => {
      const output = `
### Criteria Status
1. [PASS] First - works
2. [FAIL] Second - broken
3. [PASS] Third - done
      `;

      const result = parseValidationOutput(output);
      expect(result.criteriaStatus).toHaveLength(3);
      expect(result.criteriaStatus[0].passed).toBe(true);
      expect(result.criteriaStatus[1].passed).toBe(false);
    });

    it('should derive status from criteria if not explicit', () => {
      const outputPass = `
1. [PASS] A
2. [PASS] B
      `;

      const outputFail = `
1. [PASS] A
2. [FAIL] B
      `;

      expect(parseValidationOutput(outputPass).passed).toBe(true);
      expect(parseValidationOutput(outputFail).passed).toBe(false);
    });

    it('should extract summary', () => {
      const output = `
### Summary
The task was completed but with some issues noted.
      `;

      const result = parseValidationOutput(output);
      expect(result.summary).toContain('completed but with some issues');
    });
  });

  describe('toTaskResult', () => {
    it('should create TaskResult from parsed output', () => {
      const parsed = {
        success: true,
        filesModified: [
          { path: 'src/index.ts', description: 'main' },
          { path: 'src/utils.ts', description: 'utils' },
        ],
        criteriaStatus: [],
        summary: 'Task done',
        raw: 'Full output here',
      };

      const result = toTaskResult('1.1', parsed, 5000, 0.05);

      expect(result.task_id).toBe('1.1');
      expect(result.status).toBe('complete');
      expect(result.duration_ms).toBe(5000);
      expect(result.output_summary).toBe('Task done');
      expect(result.files_modified).toEqual(['src/index.ts', 'src/utils.ts']);
      expect(result.cost_usd).toBe(0.05);
    });

    it('should set status to failed for unsuccessful parse', () => {
      const parsed = {
        success: false,
        filesModified: [],
        criteriaStatus: [],
        summary: 'Error occurred',
        raw: 'Error output',
      };

      const result = toTaskResult('1.2', parsed, 1000);

      expect(result.status).toBe('failed');
    });

    it('should include timestamps', () => {
      const parsed = {
        success: true,
        filesModified: [],
        criteriaStatus: [],
        summary: '',
        raw: '',
      };

      const result = toTaskResult('1.1', parsed, 5000);

      expect(result.started_at).toBeDefined();
      expect(result.completed_at).toBeDefined();
      expect(new Date(result.completed_at!).getTime()).toBeGreaterThan(
        new Date(result.started_at!).getTime()
      );
    });

    it('should truncate long raw output', () => {
      const parsed = {
        success: true,
        filesModified: [],
        criteriaStatus: [],
        summary: '',
        raw: 'x'.repeat(20000),
      };

      const result = toTaskResult('1.1', parsed, 1000);

      expect(result.raw_output?.length).toBeLessThanOrEqual(10000);
    });

    it('should detect test status from tests info', () => {
      const parsedPass = {
        success: true,
        filesModified: [],
        criteriaStatus: [],
        summary: '',
        raw: '',
        testsInfo: '15 tests passing',
      };

      const parsedFail = {
        success: true,
        filesModified: [],
        criteriaStatus: [],
        summary: '',
        raw: '',
        testsInfo: '2 tests failing',
      };

      expect(toTaskResult('1.1', parsedPass, 1000).tests_passed).toBe(true);
      expect(toTaskResult('1.1', parsedFail, 1000).tests_passed).toBe(false);
    });
  });
});
