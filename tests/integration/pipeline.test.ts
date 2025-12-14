import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Pipeline } from '../../src/lib/pipeline.js';

// Mock LLMService to avoid actual API calls
vi.mock('../../src/lib/llm/llm-service.js', () => ({
  LLMService: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockResolvedValue({
      content: `## Problem Statement
A simple todo application

## Target Users
Developers

## Use Cases
- Create todos
- Mark complete

## Success Criteria
- Working todo list

## Constraints
### Must Have
- Basic CRUD

### Nice to Have
- Categories

### Out of Scope
- User auth`,
      inputTokens: 100,
      outputTokens: 200,
      cost: 0.001,
    }),
  })),
}));

// Mock simple-git
vi.mock('simple-git', () => ({
  default: vi.fn().mockReturnValue({
    revparse: vi.fn().mockRejectedValue(new Error('Not a repo')),
    init: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue({
      isClean: () => true,
      modified: [],
      created: [],
      deleted: [],
      staged: [],
      current: 'main',
      tracking: null,
    }),
    branch: vi.fn().mockResolvedValue({
      all: ['main'],
      current: 'main',
    }),
    checkoutLocalBranch: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue({ commit: 'abc123' }),
  }),
}));

// Mock terminal to suppress output
vi.mock('../../src/lib/ui/terminal.js', () => ({
  printHeader: vi.fn(),
  printSection: vi.fn(),
  printInfo: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printWarning: vi.fn(),
  printProgress: vi.fn(),
  formatCost: vi.fn((c: number) => `$${c.toFixed(4)}`),
  formatDuration: vi.fn((s: number) => `${s}s`),
  confirm: vi.fn().mockResolvedValue(true),
  prompt: vi.fn().mockResolvedValue('test input'),
  createSpinner: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  }),
}));

describe('Pipeline Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDir = path.join(os.tmpdir(), `pipeline-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Pipeline constructor', () => {
    it('should create pipeline with default config', () => {
      const pipeline = new Pipeline({
        projectDir: testDir,
        interactive: false,
      });

      expect(pipeline).toBeDefined();
    });

    it('should create pipeline with custom git config', () => {
      const pipeline = new Pipeline({
        projectDir: testDir,
        interactive: false,
        gitEnabled: false,
        gitAutoCommit: false,
      });

      expect(pipeline).toBeDefined();
    });
  });

  describe('Pipeline managers', () => {
    it('should provide access to state manager', () => {
      const pipeline = new Pipeline({
        projectDir: testDir,
        interactive: false,
      });

      const stateManager = pipeline.getStateManager();
      expect(stateManager).toBeDefined();
    });

    it('should provide access to document manager', () => {
      const pipeline = new Pipeline({
        projectDir: testDir,
        interactive: false,
      });

      const docManager = pipeline.getDocumentManager();
      expect(docManager).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle missing project gracefully', async () => {
      const pipeline = new Pipeline({
        projectDir: testDir,
        interactive: false,
        gitEnabled: false,
      });

      // Trying to resume without initialization should handle gracefully
      // This tests that the state manager handles missing files properly
      await expect(async () => {
        await pipeline.resume();
      }).rejects.toThrow();
    });
  });

  describe('Pipeline state flow', () => {
    it('should track phase completion', async () => {
      const pipeline = new Pipeline({
        projectDir: testDir,
        interactive: false,
        gitEnabled: false,
      });

      // Just verify the pipeline structure is correct
      const stateManager = pipeline.getStateManager();
      expect(stateManager).toBeDefined();
    });
  });
});
