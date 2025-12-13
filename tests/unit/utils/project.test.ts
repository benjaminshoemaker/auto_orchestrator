import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  findProjectRoot,
  getProjectPaths,
  validateProjectDir,
  initProjectDir,
  projectExists,
} from '../../../src/utils/project.js';

describe('Project Utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orchestrator-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('getProjectPaths', () => {
    it('should return correct paths', () => {
      const paths = getProjectPaths('/some/project');

      expect(paths.root).toBe('/some/project');
      expect(paths.projectMd).toBe('/some/project/PROJECT.md');
      expect(paths.claudeMd).toBe('/some/project/CLAUDE.md');
      expect(paths.tasksDir).toBe('/some/project/tasks');
      expect(paths.resultsDir).toBe('/some/project/tasks/results');
    });
  });

  describe('findProjectRoot', () => {
    it('should find project root when PROJECT.md exists', async () => {
      // Create PROJECT.md in temp dir
      await fs.writeFile(path.join(tempDir, 'PROJECT.md'), '# Test');

      // Create subdirectory
      const subDir = path.join(tempDir, 'src', 'lib');
      await fs.mkdir(subDir, { recursive: true });

      // Should find root from subdirectory
      const root = findProjectRoot(subDir);
      expect(root).toBe(tempDir);
    });

    it('should return null when no PROJECT.md found', () => {
      const root = findProjectRoot(tempDir);
      expect(root).toBeNull();
    });

    it('should work from current directory by default', () => {
      // This test just verifies the function doesn't throw without args
      const root = findProjectRoot();
      // Result depends on where tests are run, so we just check it returns string or null
      expect(root === null || typeof root === 'string').toBe(true);
    });
  });

  describe('validateProjectDir', () => {
    it('should validate directory with PROJECT.md', async () => {
      await fs.writeFile(path.join(tempDir, 'PROJECT.md'), '# Test');

      const result = await validateProjectDir(tempDir);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when PROJECT.md is missing', async () => {
      const result = await validateProjectDir(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('PROJECT.md not found');
    });

    it('should fail when directory does not exist', async () => {
      const result = await validateProjectDir('/nonexistent/path');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Directory does not exist');
    });

    it('should fail when path is a file', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');

      const result = await validateProjectDir(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path is not a directory');
    });
  });

  describe('initProjectDir', () => {
    it('should create project structure', async () => {
      const paths = await initProjectDir(tempDir, 'Test Project');

      // Check files exist
      const projectMd = await fs.readFile(paths.projectMd, 'utf-8');
      const claudeMd = await fs.readFile(paths.claudeMd, 'utf-8');

      expect(projectMd).toContain('Test Project');
      expect(projectMd).toContain('version: 1');
      expect(claudeMd).toContain('Test Project');

      // Check directories exist
      const tasksDir = await fs.stat(paths.tasksDir);
      const resultsDir = await fs.stat(paths.resultsDir);

      expect(tasksDir.isDirectory()).toBe(true);
      expect(resultsDir.isDirectory()).toBe(true);
    });

    it('should generate unique project ID', async () => {
      await initProjectDir(tempDir, 'Test');

      const content = await fs.readFile(path.join(tempDir, 'PROJECT.md'), 'utf-8');

      // Should have slugified name and timestamp-based ID
      expect(content).toMatch(/project_id: "test-[a-z0-9]+"/);
    });

    it('should set correct initial phase', async () => {
      await initProjectDir(tempDir, 'Test');

      const content = await fs.readFile(path.join(tempDir, 'PROJECT.md'), 'utf-8');

      expect(content).toContain('current_phase: 1');
      expect(content).toContain('phase_status: "pending"');
    });
  });

  describe('projectExists', () => {
    it('should return true when PROJECT.md exists', async () => {
      await fs.writeFile(path.join(tempDir, 'PROJECT.md'), '# Test');

      const exists = await projectExists(tempDir);

      expect(exists).toBe(true);
    });

    it('should return false when PROJECT.md does not exist', async () => {
      const exists = await projectExists(tempDir);

      expect(exists).toBe(false);
    });
  });
});
