import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTestTempDir } from '../helpers/temp-dir.js';

const CLI_PATH = path.resolve(__dirname, '../../src/index.ts');

function runCLI(args: string, cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    // Unset ANTHROPIC_API_KEY to prevent init from trying to run Phase 1
    // These tests only verify project structure creation, not LLM interactions
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    const stdout = execSync(`npx tsx ${CLI_PATH} ${args}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      exitCode: execError.status || 1,
    };
  }
}

describe('Init and Status Commands', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTestTempDir('orchestrator-test-');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('init command', () => {
    it('should create project structure', async () => {
      const result = runCLI(`init "Test Todo App" --dir "${tempDir}"`, tempDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Project initialized successfully');

      // Check files were created
      const projectMd = await fs.readFile(path.join(tempDir, 'PROJECT.md'), 'utf-8');
      const claudeMd = await fs.readFile(path.join(tempDir, 'CLAUDE.md'), 'utf-8');

      expect(projectMd).toContain('Test Todo App');
      expect(projectMd).toContain('version: 1');
      expect(claudeMd).toContain('Test Todo App');
    });

    it('should fail if project already exists', async () => {
      // Create first project
      runCLI(`init "First Project" --dir "${tempDir}"`, tempDir);

      // Try to create second project
      const result = runCLI(`init "Second Project" --dir "${tempDir}"`, tempDir);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('already exists');
    });

    it('should use custom name when provided', async () => {
      const result = runCLI(`init "My Idea" --dir "${tempDir}" --name "Custom Name"`, tempDir);

      expect(result.exitCode).toBe(0);

      const projectMd = await fs.readFile(path.join(tempDir, 'PROJECT.md'), 'utf-8');
      expect(projectMd).toContain('Custom Name');
    });

    it('should create tasks directory', async () => {
      runCLI(`init "Test" --dir "${tempDir}"`, tempDir);

      const stat = await fs.stat(path.join(tempDir, 'tasks'));
      expect(stat.isDirectory()).toBe(true);

      const resultsStat = await fs.stat(path.join(tempDir, 'tasks', 'results'));
      expect(resultsStat.isDirectory()).toBe(true);
    });
  });

  describe('status command', () => {
    it('should fail when not in a project', async () => {
      const result = runCLI(`status --dir "${tempDir}"`, tempDir);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Not in an orchestrator project');
    });

    it('should show project status', async () => {
      // Initialize project first
      runCLI(`init "Test Project" --dir "${tempDir}"`, tempDir);

      const result = runCLI(`status --dir "${tempDir}"`, tempDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test Project');
      expect(result.stdout).toContain('PROJECT.md');
    });

    it('should output JSON when --json flag is used', async () => {
      runCLI(`init "Test Project" --dir "${tempDir}"`, tempDir);

      const result = runCLI(`status --dir "${tempDir}" --json`, tempDir);

      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json.projectName).toBe('Test Project');
      expect(json.hasProjectMd).toBe(true);
      expect(json.hasClaudeMd).toBe(true);
      expect(json.hasTasksDir).toBe(true);
    });

    it('should work from subdirectory', async () => {
      // Initialize project
      runCLI(`init "Test Project" --dir "${tempDir}"`, tempDir);

      // Create subdirectory
      const subDir = path.join(tempDir, 'src', 'lib');
      await fs.mkdir(subDir, { recursive: true });

      // Run status from subdirectory
      const result = runCLI(`status`, subDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test Project');
    });
  });
});
