import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTestTempDir } from '../helpers/temp-dir.js';
import { DocumentManager } from '../../src/lib/documents.js';
import {
  Task,
  ImplementationPhase,
  IdeationContent,
  SpecificationContent,
} from '../../src/types/index.js';
import { createTaskResult } from '../../src/lib/task-results.js';

describe('DocumentManager Integration', () => {
  let tempDir: string;
  let manager: DocumentManager;

  beforeEach(async () => {
    tempDir = await createTestTempDir('doc-manager-test-');
    manager = new DocumentManager(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should create PROJECT.md', async () => {
      await manager.initialize('Test Project', 'A test project');

      const exists = await fs
        .access(path.join(tempDir, 'PROJECT.md'))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create CLAUDE.md', async () => {
      await manager.initialize('Test Project', 'A test project');

      const exists = await fs
        .access(path.join(tempDir, 'CLAUDE.md'))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create tasks/results directory', async () => {
      await manager.initialize('Test Project', 'A test project');

      const stat = await fs.stat(path.join(tempDir, 'tasks', 'results'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('should throw if PROJECT.md already exists', async () => {
      await manager.initialize('Test', 'Test');

      await expect(manager.initialize('Test', 'Test')).rejects.toThrow();
    });
  });

  describe('readProject', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should return parsed ProjectDocument', async () => {
      const doc = await manager.readProject();

      expect(doc.meta.project_name).toBe('Test Project');
      expect(doc.meta.version).toBe(1);
    });

    it('should include meta gates', async () => {
      const doc = await manager.readProject();

      expect(doc.meta.gates).toBeDefined();
      expect(doc.meta.gates.ideation_complete).toBe(false);
    });
  });

  describe('updateProjectMeta', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should update meta fields', async () => {
      await manager.updateProjectMeta({
        phase_status: 'in_progress',
      });

      const doc = await manager.readProject();
      expect(doc.meta.phase_status).toBe('in_progress');
    });

    it('should preserve other fields', async () => {
      await manager.updateProjectMeta({
        phase_status: 'complete',
      });

      const doc = await manager.readProject();
      expect(doc.meta.project_name).toBe('Test Project');
    });
  });

  describe('updateTask', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');

      // Add an implementation phase with tasks
      const phase: ImplementationPhase = {
        phase_number: 1,
        name: 'Setup',
        description: 'Initial setup',
        status: 'pending',
        tasks: [
          {
            id: '1.1',
            description: 'Create config',
            status: 'pending',
            depends_on: [],
            acceptance_criteria: [],
          },
          {
            id: '1.2',
            description: 'Add types',
            status: 'pending',
            depends_on: ['1.1'],
            acceptance_criteria: [],
          },
        ],
      };
      await manager.addImplementationPhase(phase);
    });

    it('should update task status', async () => {
      await manager.updateTask('1.1', { status: 'complete' });

      const doc = await manager.readProject();
      const task = doc.implementation_phases[0]?.tasks.find((t) => t.id === '1.1');
      expect(task?.status).toBe('complete');
    });

    it('should preserve other tasks', async () => {
      await manager.updateTask('1.1', { status: 'complete' });

      const doc = await manager.readProject();
      const task12 = doc.implementation_phases[0]?.tasks.find((t) => t.id === '1.2');
      expect(task12?.status).toBe('pending');
    });
  });

  describe('updateApproval', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should add new approval', async () => {
      await manager.updateApproval({
        phase: 'Phase 1',
        status: 'approved',
        notes: 'Looks good',
      });

      const doc = await manager.readProject();
      const approval = doc.approvals.find((a) => a.phase === 'Phase 1');
      expect(approval?.status).toBe('approved');
      expect(approval?.notes).toBe('Looks good');
    });

    it('should update existing approval', async () => {
      await manager.updateApproval({
        phase: 'Phase 1',
        status: 'pending',
      });

      await manager.updateApproval({
        phase: 'Phase 1',
        status: 'approved',
        notes: 'Now approved',
      });

      const doc = await manager.readProject();
      const approval = doc.approvals.find((a) => a.phase === 'Phase 1');
      expect(approval?.status).toBe('approved');
    });
  });

  describe('updateIdeation', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should update ideation content', async () => {
      const ideation: IdeationContent = {
        problem_statement: 'Users need better task management',
        target_users: 'Developers',
        use_cases: ['Track tasks', 'Set priorities'],
        success_criteria: ['Fast', 'Intuitive'],
        constraints: {
          must_have: ['Offline support'],
          nice_to_have: ['Sync'],
          out_of_scope: ['Team features'],
        },
        raw_content: '',
      };

      await manager.updateIdeation(ideation);

      const doc = await manager.readProject();
      expect(doc.ideation?.problem_statement).toBe('Users need better task management');
      expect(doc.ideation?.use_cases).toContain('Track tasks');
    });
  });

  describe('updateSpecification', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should update specification content', async () => {
      const spec: SpecificationContent = {
        architecture: 'Single-page application',
        tech_stack: [
          { layer: 'Frontend', choice: 'React', rationale: 'Popular' },
        ],
        data_models: 'Task interface with id, title, status',
        api_contracts: 'GET /tasks, POST /tasks',
        ui_requirements: 'Clean minimal interface',
        raw_content: '',
      };

      await manager.updateSpecification(spec);

      const doc = await manager.readProject();
      expect(doc.specification?.architecture).toBe('Single-page application');
      expect(doc.specification?.tech_stack[0]?.choice).toBe('React');
    });
  });

  describe('addImplementationPhase', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should add implementation phase', async () => {
      const phase: ImplementationPhase = {
        phase_number: 1,
        name: 'Foundation',
        description: 'Set up project basics',
        status: 'pending',
        tasks: [
          {
            id: '1.1',
            description: 'Initialize project',
            status: 'pending',
            depends_on: [],
            acceptance_criteria: ['Build passes'],
          },
        ],
      };

      await manager.addImplementationPhase(phase);

      const doc = await manager.readProject();
      expect(doc.implementation_phases).toHaveLength(1);
      expect(doc.implementation_phases[0]?.name).toBe('Foundation');
    });
  });

  describe('task results', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should save and retrieve task result', async () => {
      const result = createTaskResult('1.1', 'Test task');
      result.status = 'complete';
      result.summary = 'Completed successfully';

      await manager.saveTaskResult(result);

      const retrieved = await manager.getTaskResult('1.1');
      expect(retrieved?.task_id).toBe('1.1');
      expect(retrieved?.status).toBe('complete');
    });

    it('should return null for non-existent result', async () => {
      const result = await manager.getTaskResult('nonexistent');
      expect(result).toBeNull();
    });

    it('should get all task results', async () => {
      await manager.saveTaskResult(createTaskResult('1.1', 'Task 1'));
      await manager.saveTaskResult(createTaskResult('1.2', 'Task 2'));

      const results = await manager.getAllTaskResults();
      expect(results).toHaveLength(2);
    });

    it('should delete task result', async () => {
      const result = createTaskResult('1.1', 'Test');
      await manager.saveTaskResult(result);

      const deleted = await manager.deleteTaskResult('1.1');
      expect(deleted).toBe(true);

      const retrieved = await manager.getTaskResult('1.1');
      expect(retrieved).toBeNull();
    });

    it('should return cost summary', async () => {
      const result1 = createTaskResult('1.1', 'Task 1');
      result1.tokens_used = 1000;
      result1.cost_usd = 0.05;

      const result2 = createTaskResult('1.2', 'Task 2');
      result2.tokens_used = 2000;
      result2.cost_usd = 0.10;

      await manager.saveTaskResult(result1);
      await manager.saveTaskResult(result2);

      const summary = await manager.getCostSummary();
      expect(summary.tokens).toBe(3000);
      expect(summary.cost).toBeCloseTo(0.15);
    });
  });

  describe('buildTaskPrompt', () => {
    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should include task details', async () => {
      const task: Task = {
        id: '1.1',
        description: 'Create config file',
        status: 'pending',
        depends_on: [],
        acceptance_criteria: ['Config loads correctly'],
      };

      const phase: ImplementationPhase = {
        phase_number: 1,
        name: 'Setup',
        description: 'Initial setup',
        status: 'in_progress',
        tasks: [task],
      };

      const prompt = await manager.buildTaskPrompt(task, phase);

      expect(prompt).toContain('**Task ID:** 1.1');
      expect(prompt).toContain('**Phase:** Setup');
      expect(prompt).toContain('Create config file');
    });

    it('should include dependency results', async () => {
      // Save a dependency result
      const depResult = createTaskResult('1.1', 'Setup project');
      depResult.status = 'complete';
      depResult.summary = 'Project scaffolding complete';
      depResult.files_created = ['package.json', 'tsconfig.json'];
      await manager.saveTaskResult(depResult);

      const task: Task = {
        id: '1.2',
        description: 'Add types',
        status: 'pending',
        depends_on: ['1.1'],
        acceptance_criteria: [],
      };

      const phase: ImplementationPhase = {
        phase_number: 1,
        name: 'Setup',
        description: 'Initial setup',
        status: 'in_progress',
        tasks: [task],
      };

      const prompt = await manager.buildTaskPrompt(task, phase);

      expect(prompt).toContain('Completed Dependencies');
      expect(prompt).toContain('Task 1.1');
      expect(prompt).toContain('Project scaffolding complete');
    });
  });

  describe('validate', () => {
    it('should pass for valid project', async () => {
      await manager.initialize('Test Project', 'A test project');

      const result = await manager.validate();
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail for missing PROJECT.md', async () => {
      // Don't initialize

      const result = await manager.validate();
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('PROJECT.md not found');
    });

    it('should fail for missing CLAUDE.md', async () => {
      await manager.initialize('Test', 'Test');
      await fs.unlink(path.join(tempDir, 'CLAUDE.md'));

      const result = await manager.validate();
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('CLAUDE.md not found');
    });

    it('should fail for missing tasks directory', async () => {
      await manager.initialize('Test', 'Test');
      await fs.rm(path.join(tempDir, 'tasks'), { recursive: true });

      const result = await manager.validate();
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('tasks/ directory not found');
    });

    it('should detect orphaned task results', async () => {
      await manager.initialize('Test', 'Test');

      // Save a result for a task that doesn't exist
      const result = createTaskResult('99.99', 'Ghost task');
      await manager.saveTaskResult(result);

      const validation = await manager.validate();
      expect(validation.valid).toBe(false);
      expect(validation.issues.some((i) => i.includes('Orphaned'))).toBe(true);
    });

    it('should detect completed tasks without results', async () => {
      await manager.initialize('Test', 'Test');

      // Add a phase with a complete task but no result
      const phase: ImplementationPhase = {
        phase_number: 1,
        name: 'Test',
        description: 'Test phase',
        status: 'complete',
        tasks: [
          {
            id: '1.1',
            description: 'Test task',
            status: 'complete',
            depends_on: [],
            acceptance_criteria: [],
          },
        ],
      };
      await manager.addImplementationPhase(phase);

      const validation = await manager.validate();
      expect(validation.valid).toBe(false);
      expect(
        validation.issues.some((i) => i.includes('marked complete but no result'))
      ).toBe(true);
    });
  });
});
