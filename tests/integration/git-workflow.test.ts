import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitWorkflowManager } from '../../src/lib/git/workflow-manager.js';
import type { GitClient } from '../../src/lib/git/git-client.js';

// These tests verify the integration between Git workflow and execution

describe('Git Workflow Integration', () => {
  let mockGitClient: {
    branchExists: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
    createBranch: ReturnType<typeof vi.fn>;
    hasUncommittedChanges: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    getCurrentBranch: ReturnType<typeof vi.fn>;
    isRepo: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGitClient = {
      branchExists: vi.fn().mockResolvedValue(false),
      checkout: vi.fn().mockResolvedValue(undefined),
      createBranch: vi.fn().mockResolvedValue(undefined),
      hasUncommittedChanges: vi.fn().mockResolvedValue(true),
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue('abc123'),
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
      isRepo: vi.fn().mockResolvedValue(true),
      getStatus: vi.fn().mockResolvedValue({
        isClean: false,
        modified: ['file.ts'],
        created: [],
        deleted: [],
        staged: [],
        currentBranch: 'main',
        tracking: 'origin/main',
      }),
    };
  });

  describe('Task completion creates commit', () => {
    it('should commit after task completion', async () => {
      const workflow = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const result = {
        task_id: '1.1',
        status: 'complete' as const,
        duration_ms: 5000,
        output_summary: 'Implemented feature X',
      };

      const hash = await workflow.commitTask('1.1', result);

      expect(hash).toBe('abc123');
      expect(mockGitClient.add).toHaveBeenCalled();
      expect(mockGitClient.commit).toHaveBeenCalledWith(
        'task-1.1: Implemented feature X'
      );
    });

    it('should not commit if no changes', async () => {
      mockGitClient.hasUncommittedChanges.mockResolvedValueOnce(false);

      const workflow = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const result = {
        task_id: '1.1',
        status: 'complete' as const,
        duration_ms: 5000,
        output_summary: 'No changes needed',
      };

      const hash = await workflow.commitTask('1.1', result);

      expect(hash).toBeNull();
      expect(mockGitClient.commit).not.toHaveBeenCalled();
    });
  });

  describe('Phase creates branch', () => {
    it('should create branch for new phase', async () => {
      const workflow = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const branch = await workflow.startImplPhase(1, 'Core Implementation');

      expect(branch).toBe('impl/phase-1-core-implementation');
      expect(mockGitClient.createBranch).toHaveBeenCalledWith(
        'impl/phase-1-core-implementation'
      );
    });

    it('should checkout existing branch', async () => {
      mockGitClient.branchExists.mockResolvedValueOnce(true);

      const workflow = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const branch = await workflow.startImplPhase(1, 'Core Implementation');

      expect(branch).toBe('impl/phase-1-core-implementation');
      expect(mockGitClient.checkout).toHaveBeenCalledWith(
        'impl/phase-1-core-implementation'
      );
      expect(mockGitClient.createBranch).not.toHaveBeenCalled();
    });
  });

  describe('Full workflow', () => {
    it('should produce clean history with proper commits', async () => {
      const commits: string[] = [];
      mockGitClient.commit.mockImplementation(async (msg: string) => {
        const hash = `commit-${commits.length + 1}`;
        commits.push(msg);
        return hash;
      });

      const workflow = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      // Start phase
      await workflow.startImplPhase(1, 'Setup');

      // Complete task 1
      await workflow.commitTask('1.1', {
        task_id: '1.1',
        status: 'complete',
        duration_ms: 1000,
        output_summary: 'Initialize project structure',
      });

      // Complete task 2
      await workflow.commitTask('1.2', {
        task_id: '1.2',
        status: 'complete',
        duration_ms: 2000,
        output_summary: 'Add configuration files',
      });

      // State change
      await workflow.commitStateChange('phase-1 complete');

      expect(commits).toHaveLength(3);
      expect(commits[0]).toContain('task-1.1');
      expect(commits[1]).toContain('task-1.2');
      expect(commits[2]).toContain('orchestrator');
    });
  });

  describe('Disabled workflow', () => {
    it('should skip all operations when disabled', async () => {
      const workflow = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      const branch = await workflow.startImplPhase(1, 'Setup');
      expect(branch).toBeNull();

      const hash = await workflow.commitTask('1.1', {
        task_id: '1.1',
        status: 'complete',
        duration_ms: 1000,
        output_summary: 'Test',
      });
      expect(hash).toBeNull();

      expect(mockGitClient.createBranch).not.toHaveBeenCalled();
      expect(mockGitClient.commit).not.toHaveBeenCalled();
    });
  });
});
