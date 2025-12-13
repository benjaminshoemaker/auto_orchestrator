import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTestTempDir } from '../../helpers/temp-dir.js';
import { ClaudeMdManager, TaskContext } from '../../../src/lib/claude-md.js';
import { Task, ImplementationPhase, TaskResult } from '../../../src/types/index.js';
import { createTaskResult } from '../../../src/lib/task-results.js';

describe('ClaudeMdManager', () => {
  let tempDir: string;
  let manager: ClaudeMdManager;

  beforeEach(async () => {
    tempDir = await createTestTempDir('claude-md-test-');
    manager = new ClaudeMdManager(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('exists', () => {
    it('should return false when CLAUDE.md does not exist', async () => {
      expect(await manager.exists()).toBe(false);
    });

    it('should return true when CLAUDE.md exists', async () => {
      await fs.writeFile(path.join(tempDir, 'CLAUDE.md'), '# Test', 'utf-8');
      expect(await manager.exists()).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should create CLAUDE.md from template', async () => {
      await manager.initialize('My Project', 'A test project');

      expect(await manager.exists()).toBe(true);
    });

    it('should include project name in content', async () => {
      await manager.initialize('Test App', 'A cool app');

      const content = await manager.read();
      expect(content).toContain('**Name:** Test App');
    });

    it('should include project description in content', async () => {
      await manager.initialize('Test App', 'A cool application for testing');

      const content = await manager.read();
      expect(content).toContain('**Description:** A cool application for testing');
    });

    it('should include code conventions section', async () => {
      await manager.initialize('Test', 'Test');

      const content = await manager.read();
      expect(content).toContain('## Code Conventions');
    });

    it('should include testing requirements section', async () => {
      await manager.initialize('Test', 'Test');

      const content = await manager.read();
      expect(content).toContain('## Testing Requirements');
    });

    it('should include output requirements section', async () => {
      await manager.initialize('Test', 'Test');

      const content = await manager.read();
      expect(content).toContain('## Output Requirements');
    });
  });

  describe('read', () => {
    it('should return file content', async () => {
      const testContent = '# Custom CLAUDE.md\n\nCustom content here.';
      await fs.writeFile(path.join(tempDir, 'CLAUDE.md'), testContent, 'utf-8');

      const content = await manager.read();
      expect(content).toBe(testContent);
    });

    it('should throw for missing file', async () => {
      await expect(manager.read()).rejects.toThrow();
    });
  });

  describe('updateProjectInfo', () => {
    beforeEach(async () => {
      await manager.initialize('Original Name', 'Original description');
    });

    it('should update project name', async () => {
      await manager.updateProjectInfo('New Name', 'New description');

      const content = await manager.read();
      expect(content).toContain('**Name:** New Name');
      expect(content).not.toContain('Original Name');
    });

    it('should update project description', async () => {
      await manager.updateProjectInfo('Name', 'Updated description');

      const content = await manager.read();
      expect(content).toContain('**Description:** Updated description');
    });

    it('should add tech stack section when provided', async () => {
      const techStack = `| Layer | Choice |
|-------|--------|
| Frontend | React |
| Backend | Node.js |`;

      await manager.updateProjectInfo('Project', 'Description', techStack);

      const content = await manager.read();
      expect(content).toContain('## Tech Stack');
      expect(content).toContain('Frontend | React');
    });

    it('should update existing tech stack', async () => {
      await manager.updateProjectInfo('Project', 'Desc', 'Old tech stack');
      await manager.updateProjectInfo('Project', 'Desc', 'New tech stack');

      const content = await manager.read();
      expect(content).toContain('New tech stack');
      expect(content).not.toContain('Old tech stack');
    });
  });

  describe('buildTaskContext', () => {
    const createTask = (overrides: Partial<Task> = {}): Task => ({
      id: '1.1',
      description: 'Implement feature X',
      status: 'pending',
      depends_on: [],
      acceptance_criteria: ['Tests pass', 'Feature works'],
      ...overrides,
    });

    const createPhase = (overrides: Partial<ImplementationPhase> = {}): ImplementationPhase => ({
      phase_number: 1,
      name: 'Foundation',
      description: 'Set up basics',
      status: 'in_progress',
      tasks: [],
      ...overrides,
    });

    const createDepResult = (taskId: string, overrides: Partial<TaskResult> = {}): TaskResult => {
      const result = createTaskResult(taskId, `Task ${taskId} description`);
      result.status = 'success';
      result.summary = `Completed task ${taskId}`;
      return { ...result, ...overrides };
    };

    beforeEach(async () => {
      await manager.initialize('Test Project', 'A test project');
    });

    it('should include base CLAUDE.md content', async () => {
      const context: TaskContext = {
        task: createTask(),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('# Project Context');
      expect(prompt).toContain('## Code Conventions');
    });

    it('should include task ID', async () => {
      const context: TaskContext = {
        task: createTask({ id: '2.3' }),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('**Task ID:** 2.3');
    });

    it('should include phase name', async () => {
      const context: TaskContext = {
        task: createTask(),
        phase: createPhase({ name: 'Core Features' }),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('**Phase:** Core Features');
    });

    it('should include task description', async () => {
      const context: TaskContext = {
        task: createTask({ description: 'Add user authentication' }),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('**Description:** Add user authentication');
    });

    it('should include acceptance criteria', async () => {
      const context: TaskContext = {
        task: createTask({
          acceptance_criteria: [
            'Login endpoint works',
            'JWT tokens generated',
            'Logout clears session',
          ],
        }),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('### Acceptance Criteria');
      expect(prompt).toContain('- [ ] Login endpoint works');
      expect(prompt).toContain('- [ ] JWT tokens generated');
      expect(prompt).toContain('- [ ] Logout clears session');
    });

    it('should include dependency results', async () => {
      const depResult = createDepResult('1.1', {
        task_description: 'Set up project',
        summary: 'Initialized project with TypeScript',
      });

      const context: TaskContext = {
        task: createTask({ id: '1.2', depends_on: ['1.1'] }),
        phase: createPhase(),
        dependencyResults: [depResult],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('### Completed Dependencies');
      expect(prompt).toContain('#### Task 1.1: Set up project');
      expect(prompt).toContain('**Summary:** Initialized project with TypeScript');
    });

    it('should include dependency files created', async () => {
      const depResult = createDepResult('1.1', {
        files_created: ['src/index.ts', 'src/types.ts'],
      });

      const context: TaskContext = {
        task: createTask(),
        phase: createPhase(),
        dependencyResults: [depResult],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('**Files created:** src/index.ts, src/types.ts');
    });

    it('should include dependency files modified', async () => {
      const depResult = createDepResult('1.1', {
        files_modified: ['package.json', 'tsconfig.json'],
      });

      const context: TaskContext = {
        task: createTask(),
        phase: createPhase(),
        dependencyResults: [depResult],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('**Files modified:** package.json, tsconfig.json');
    });

    it('should include dependency key decisions', async () => {
      const depResult = createDepResult('1.1', {
        key_decisions: [
          { decision: 'Use ESM modules', rationale: 'Modern standard' },
          { decision: 'Strict TypeScript', rationale: 'Better type safety' },
        ],
      });

      const context: TaskContext = {
        task: createTask(),
        phase: createPhase(),
        dependencyResults: [depResult],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('**Key decisions:**');
      expect(prompt).toContain('- Use ESM modules: Modern standard');
      expect(prompt).toContain('- Strict TypeScript: Better type safety');
    });

    it('should include multiple dependencies', async () => {
      const depResult1 = createDepResult('1.1', {
        task_description: 'Task one',
        summary: 'First task done',
      });
      const depResult2 = createDepResult('1.2', {
        task_description: 'Task two',
        summary: 'Second task done',
      });

      const context: TaskContext = {
        task: createTask({ id: '1.3', depends_on: ['1.1', '1.2'] }),
        phase: createPhase(),
        dependencyResults: [depResult1, depResult2],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('#### Task 1.1: Task one');
      expect(prompt).toContain('#### Task 1.2: Task two');
    });

    it('should include instructions section', async () => {
      const context: TaskContext = {
        task: createTask(),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('### Instructions');
      expect(prompt).toContain('Write failing tests first (TDD)');
      expect(prompt).toContain('npm test');
    });

    it('should include output format with correct task ID', async () => {
      const context: TaskContext = {
        task: createTask({ id: '3.5' }),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('### Output Format');
      expect(prompt).toContain('tasks/results/task-3.5.json');
    });

    it('should include task result schema', async () => {
      const context: TaskContext = {
        task: createTask(),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('"task_id": "string"');
      expect(prompt).toContain('"status": "success" | "failed"');
      expect(prompt).toContain('"acceptance_criteria"');
    });

    it('should include important warning about success status', async () => {
      const context: TaskContext = {
        task: createTask(),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      expect(prompt).toContain('IMPORTANT');
      expect(prompt).toContain('status to "success" only if ALL acceptance criteria');
    });

    it('should handle task with no acceptance criteria', async () => {
      const context: TaskContext = {
        task: createTask({ acceptance_criteria: [] }),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      // Should not have acceptance criteria section if empty
      expect(prompt).not.toContain('### Acceptance Criteria');
    });

    it('should handle no dependencies gracefully', async () => {
      const context: TaskContext = {
        task: createTask({ depends_on: [] }),
        phase: createPhase(),
        dependencyResults: [],
      };

      const prompt = await manager.buildTaskContext(context);

      // Should not have dependencies section if empty
      expect(prompt).not.toContain('### Completed Dependencies');
    });
  });
});
