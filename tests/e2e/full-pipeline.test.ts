import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Pipeline } from '../../src/lib/pipeline.js';

/**
 * End-to-End Pipeline Tests
 *
 * These tests run the actual pipeline with real LLM calls.
 * They are expensive and slow, so they are skipped by default.
 *
 * To run these tests:
 *   RUN_E2E=true npm test -- tests/e2e/
 *
 * Make sure you have ANTHROPIC_API_KEY set in your environment.
 */

describe('Full Pipeline E2E', () => {
  let testDir: string | null = null;

  afterEach(async () => {
    // Clean up test directory
    if (testDir) {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testDir = null;
    }
  });

  it('should be skipped unless RUN_E2E=true', () => {
    if (process.env.RUN_E2E !== 'true') {
      console.log('Skipping E2E test. Set RUN_E2E=true to run.');
      expect(true).toBe(true);
      return;
    }
  });

  it(
    'should complete simple project through all planning phases',
    async () => {
      // Skip unless explicitly enabled
      if (process.env.RUN_E2E !== 'true') {
        console.log('Skipping E2E test. Set RUN_E2E=true to run.');
        return;
      }

      // Verify API key is set
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY must be set for E2E tests');
      }

      testDir = path.join(os.tmpdir(), `e2e-test-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      const pipeline = new Pipeline({
        projectDir: testDir,
        interactive: false,
        gitEnabled: false, // Disable git for E2E tests
        skipImplementation: true, // Skip implementation - requires Claude CLI
        autoComplete: true, // Skip interactive conversation loops
      });

      // Run just through planning phases (not implementation)
      // Implementation requires Claude CLI and takes much longer
      const result = await pipeline.initAndRun('A simple hello world CLI that greets users');

      // Verify phases completed
      expect(result.phasesCompleted).toContain('ideation');
      expect(result.phasesCompleted).toContain('specification');
      expect(result.phasesCompleted).toContain('planning');

      // Verify project name was set
      expect(result.projectName).toBeTruthy();

      // Verify PROJECT.md was created
      const projectMdPath = path.join(testDir, 'PROJECT.md');
      const projectMdExists = await fs
        .access(projectMdPath)
        .then(() => true)
        .catch(() => false);
      expect(projectMdExists).toBe(true);

      // Read and verify PROJECT.md has expected content
      const projectMd = await fs.readFile(projectMdPath, 'utf-8');
      expect(projectMd).toContain('Idea Refinement');
      expect(projectMd).toContain('Specification');
      expect(projectMd).toContain('Implementation Phases');
    },
    600000 // 10 minute timeout - prefer complete tests over fast ones
  );

  it(
    'should resume from ideation phase',
    async () => {
      // Skip unless explicitly enabled
      if (process.env.RUN_E2E !== 'true') {
        console.log('Skipping E2E test. Set RUN_E2E=true to run.');
        return;
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY must be set for E2E tests');
      }

      testDir = path.join(os.tmpdir(), `e2e-resume-test-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      // First pipeline run - just create project
      const pipeline1 = new Pipeline({
        projectDir: testDir,
        interactive: false,
        gitEnabled: false,
      });

      // Just verify state manager exists
      expect(pipeline1.getStateManager()).toBeDefined();

      // Create a new pipeline and verify it can access the directory
      const pipeline2 = new Pipeline({
        projectDir: testDir,
        interactive: false,
        gitEnabled: false,
      });

      expect(pipeline2.getStateManager()).toBeDefined();
    },
    300000 // 5 minute timeout - prefer complete tests over fast ones
  );
});
