import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

const CLI_PATH = path.resolve(__dirname, '../../src/index.ts');

function runCLI(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx ${CLI_PATH} ${args}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
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

describe('CLI', () => {
  describe('--help', () => {
    it('should show help with all commands', () => {
      const result = runCLI('--help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('orchestrator');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('resume');
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('approve');
      expect(result.stdout).toContain('skip');
      expect(result.stdout).toContain('retry');
      expect(result.stdout).toContain('config');
    });
  });

  describe('--version', () => {
    it('should show version', () => {
      const result = runCLI('--version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('0.1.0');
    });
  });

  describe('init command', () => {
    it('should be recognized and work', () => {
      // Note: This test creates files in cwd, the full init tests are in init-status.test.ts
      const result = runCLI('init "test idea"');
      // Either succeeds or fails due to existing project - both are valid
      expect(result.stdout).toMatch(/Initializing project|already exists/);
    });

    it('should show help', () => {
      const result = runCLI('init --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Start a new project');
      expect(result.stdout).toContain('--dir');
      expect(result.stdout).toContain('--name');
    });
  });

  describe('resume command', () => {
    it('should be recognized', () => {
      const result = runCLI('resume');
      // Either resumes or reports not in project
      expect(result.stdout).toMatch(/Not in an orchestrator project|Resuming|Running Phase/);
    });
  });

  describe('status command', () => {
    it('should be recognized and work', () => {
      // Note: The full status tests are in init-status.test.ts
      const result = runCLI('status');
      // Either shows status or reports not in project
      expect(result.stdout).toMatch(/Project:|Not in an orchestrator project/);
    });

    it('should accept --json flag', () => {
      const result = runCLI('status --help');
      expect(result.stdout).toContain('--json');
    });
  });

  describe('approve command', () => {
    it('should be recognized', () => {
      const result = runCLI('approve phase-1');
      // Either approves or reports not in project
      expect(result.stdout).toMatch(/Not in an orchestrator project|approved/);
    });
  });

  describe('skip command', () => {
    it('should require reason', () => {
      const result = runCLI('skip 1.1');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--reason');
    });

    it('should accept reason', () => {
      const result = runCLI('skip 1.1 --reason "manual completion"');
      // Either skips or reports not in project
      expect(result.stdout).toMatch(/not implemented|Not in an orchestrator project|skipped/);
    });
  });

  describe('retry command', () => {
    it('should be recognized', () => {
      const result = runCLI('retry 1.1');
      // Either retries or reports not in project
      expect(result.stdout).toMatch(/Not in an orchestrator project|retry|Task/);
    });
  });

  describe('config command', () => {
    it('should be recognized', () => {
      const result = runCLI('config');
      expect(result.stdout).toContain('not implemented');
    });
  });

  describe('unknown command', () => {
    it('should show error for unknown command', () => {
      const result = runCLI('unknown');
      expect(result.exitCode).toBe(1);
    });
  });
});
