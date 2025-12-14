import { describe, it, expect } from 'vitest';
import {
  buildTaskPrompt,
  buildValidationPrompt,
  buildRetryPrompt,
  buildBatchPrompt,
  type TaskContext,
} from '../../../../src/lib/execution/prompt-builder.js';
import type { Task } from '../../../../src/types/index.js';

describe('Prompt Builder', () => {
  const sampleTask: Task = {
    id: '1.1',
    description: 'Set up project structure with TypeScript',
    acceptance_criteria: [
      'package.json exists with correct name',
      'tsconfig.json is properly configured',
      'src/ directory structure is created',
    ],
    depends_on: [],
    status: 'pending',
  };

  const sampleContext: TaskContext = {
    projectName: 'test-project',
    phaseName: 'Foundation',
    phaseNumber: 1,
  };

  describe('buildTaskPrompt', () => {
    it('should include project name and phase', () => {
      const prompt = buildTaskPrompt(sampleTask, sampleContext);

      expect(prompt).toContain('test-project');
      expect(prompt).toContain('Phase 1');
      expect(prompt).toContain('Foundation');
    });

    it('should include task id and description', () => {
      const prompt = buildTaskPrompt(sampleTask, sampleContext);

      expect(prompt).toContain('Task 1.1');
      expect(prompt).toContain('Set up project structure');
    });

    it('should include all acceptance criteria', () => {
      const prompt = buildTaskPrompt(sampleTask, sampleContext);

      expect(prompt).toContain('1. package.json exists');
      expect(prompt).toContain('2. tsconfig.json');
      expect(prompt).toContain('3. src/ directory');
    });

    it('should include architecture when provided', () => {
      const context: TaskContext = {
        ...sampleContext,
        architecture: 'Microservices with REST API',
      };

      const prompt = buildTaskPrompt(sampleTask, context);

      expect(prompt).toContain('Microservices with REST API');
    });

    it('should include tech stack when provided', () => {
      const context: TaskContext = {
        ...sampleContext,
        techStack: [
          { layer: 'Frontend', choice: 'React', rationale: 'Popular' },
          { layer: 'Backend', choice: 'Node.js' },
        ],
      };

      const prompt = buildTaskPrompt(sampleTask, context);

      expect(prompt).toContain('Frontend: React');
      expect(prompt).toContain('Backend: Node.js');
      expect(prompt).toContain('(Popular)');
    });

    it('should include dependencies when task has them', () => {
      const taskWithDeps: Task = {
        ...sampleTask,
        depends_on: ['0.1', '0.2'],
      };

      const prompt = buildTaskPrompt(taskWithDeps, sampleContext);

      expect(prompt).toContain('0.1, 0.2');
    });

    it('should include previous completed tasks', () => {
      const context: TaskContext = {
        ...sampleContext,
        previousTasks: [
          {
            id: '0.1',
            description: 'Initialize repo',
            acceptance_criteria: [],
            depends_on: [],
            status: 'complete',
          },
        ],
      };

      const prompt = buildTaskPrompt(sampleTask, context);

      expect(prompt).toContain('Previously Completed');
      expect(prompt).toContain('0.1: Initialize repo');
    });

    it('should include CLAUDE.md reference when provided', () => {
      const context: TaskContext = {
        ...sampleContext,
        claudeMdPath: 'CLAUDE.md',
      };

      const prompt = buildTaskPrompt(sampleTask, context);

      expect(prompt).toContain('CLAUDE.md');
    });

    it('should include output format instructions', () => {
      const prompt = buildTaskPrompt(sampleTask, sampleContext);

      expect(prompt).toContain('Output Format');
      expect(prompt).toContain('Files Modified');
      expect(prompt).toContain('[PASS/FAIL]');
    });
  });

  describe('buildValidationPrompt', () => {
    it('should include original task description', () => {
      const prompt = buildValidationPrompt(sampleTask, 'output');

      expect(prompt).toContain('Set up project structure');
    });

    it('should include acceptance criteria', () => {
      const prompt = buildValidationPrompt(sampleTask, 'output');

      expect(prompt).toContain('package.json exists');
      expect(prompt).toContain('tsconfig.json');
    });

    it('should include execution output', () => {
      const output = 'Task completed successfully\nFiles created';
      const prompt = buildValidationPrompt(sampleTask, output);

      expect(prompt).toContain('Task completed successfully');
      expect(prompt).toContain('Files created');
    });

    it('should truncate long output', () => {
      const longOutput = 'x'.repeat(10000);
      const prompt = buildValidationPrompt(sampleTask, longOutput);

      expect(prompt.length).toBeLessThan(longOutput.length);
    });

    it('should include validation instructions', () => {
      const prompt = buildValidationPrompt(sampleTask, 'output');

      expect(prompt).toContain('Validation Result');
      expect(prompt).toContain('Status:');
    });
  });

  describe('buildRetryPrompt', () => {
    it('should include original task prompt', () => {
      const prompt = buildRetryPrompt(
        sampleTask,
        'previous output',
        'Tests failed',
        sampleContext
      );

      expect(prompt).toContain('Task 1.1');
      expect(prompt).toContain('test-project');
    });

    it('should include failure reason', () => {
      const prompt = buildRetryPrompt(
        sampleTask,
        'output',
        'Tests failed',
        sampleContext
      );

      expect(prompt).toContain('Previous Attempt Failed');
      expect(prompt).toContain('Tests failed');
    });

    it('should include previous output', () => {
      const prompt = buildRetryPrompt(
        sampleTask,
        'Error: Module not found',
        'failure',
        sampleContext
      );

      expect(prompt).toContain('Error: Module not found');
    });

    it('should include retry instructions', () => {
      const prompt = buildRetryPrompt(
        sampleTask,
        'output',
        'failure',
        sampleContext
      );

      expect(prompt).toContain('Retry Instructions');
      expect(prompt).toContain('fix the issues');
    });

    it('should truncate long previous output', () => {
      const longOutput = 'x'.repeat(5000);
      const prompt = buildRetryPrompt(
        sampleTask,
        longOutput,
        'failure',
        sampleContext
      );

      // Should be truncated to 2000 chars
      const matches = prompt.match(/x+/g);
      const longestMatch = matches?.reduce((a, b) =>
        a.length > b.length ? a : b
      );
      expect(longestMatch?.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('buildBatchPrompt', () => {
    const tasks: Task[] = [
      sampleTask,
      {
        id: '1.2',
        description: 'Create database schema',
        acceptance_criteria: ['Schema is valid', 'Migrations run'],
        depends_on: ['1.1'],
        status: 'pending',
      },
    ];

    it('should include all tasks', () => {
      const prompt = buildBatchPrompt(tasks, sampleContext);

      expect(prompt).toContain('Task 1: 1.1');
      expect(prompt).toContain('Task 2: 1.2');
    });

    it('should include task count', () => {
      const prompt = buildBatchPrompt(tasks, sampleContext);

      expect(prompt).toContain('2 total');
    });

    it('should include project context', () => {
      const prompt = buildBatchPrompt(tasks, sampleContext);

      expect(prompt).toContain('test-project');
      expect(prompt).toContain('Phase 1');
    });

    it('should include criteria for all tasks', () => {
      const prompt = buildBatchPrompt(tasks, sampleContext);

      expect(prompt).toContain('package.json exists');
      expect(prompt).toContain('Schema is valid');
    });

    it('should include batch instructions', () => {
      const prompt = buildBatchPrompt(tasks, sampleContext);

      expect(prompt).toContain('Complete all 2 tasks');
    });
  });
});
