import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitWorkflowManager } from '../../../../src/lib/git/workflow-manager.js';
import type { GitClient } from '../../../../src/lib/git/git-client.js';
import type { TaskResult } from '../../../../src/types/index.js';

describe('GitWorkflowManager', () => {
  let mockGitClient: {
    branchExists: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
    createBranch: ReturnType<typeof vi.fn>;
    hasUncommittedChanges: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    getCurrentBranch: ReturnType<typeof vi.fn>;
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
    };
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      expect(manager.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      expect(manager.isEnabled()).toBe(false);
    });
  });

  describe('formatBranchName', () => {
    it('should format branch name with default prefix', () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const name = manager.formatBranchName(1, 'Setup Environment');
      expect(name).toBe('impl/phase-1-setup-environment');
    });

    it('should format branch name with custom prefix', () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
        branchPrefix: 'feature',
      });

      const name = manager.formatBranchName(2, 'Core Features');
      expect(name).toBe('feature/phase-2-core-features');
    });

    it('should sanitize special characters', () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const name = manager.formatBranchName(1, 'API & Database!!');
      expect(name).toBe('impl/phase-1-api-database');
    });
  });

  describe('formatCommitMessage', () => {
    it('should format commit message', () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const message = manager.formatCommitMessage('task-1.1', 'Implement feature');
      expect(message).toBe('task-1.1: Implement feature');
    });

    it('should truncate long descriptions', () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const longDesc = 'A'.repeat(100);
      const message = manager.formatCommitMessage('task-1.1', longDesc);
      expect(message.length).toBeLessThanOrEqual(85); // type + ': ' + 72 chars
      expect(message).toContain('...');
    });
  });

  describe('startImplPhase', () => {
    it('should create new branch when it does not exist', async () => {
      mockGitClient.branchExists.mockResolvedValueOnce(false);

      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const branch = await manager.startImplPhase(1, 'Setup');

      expect(branch).toBe('impl/phase-1-setup');
      expect(mockGitClient.createBranch).toHaveBeenCalledWith('impl/phase-1-setup');
      expect(mockGitClient.checkout).not.toHaveBeenCalled();
    });

    it('should checkout existing branch', async () => {
      mockGitClient.branchExists.mockResolvedValueOnce(true);

      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const branch = await manager.startImplPhase(1, 'Setup');

      expect(branch).toBe('impl/phase-1-setup');
      expect(mockGitClient.checkout).toHaveBeenCalledWith('impl/phase-1-setup');
      expect(mockGitClient.createBranch).not.toHaveBeenCalled();
    });

    it('should return null when disabled', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      const branch = await manager.startImplPhase(1, 'Setup');

      expect(branch).toBeNull();
      expect(mockGitClient.branchExists).not.toHaveBeenCalled();
    });
  });

  describe('commitTask', () => {
    const sampleResult: TaskResult = {
      task_id: '1.1',
      status: 'complete',
      duration_ms: 5000,
      output_summary: 'Implemented the feature successfully',
    };

    it('should commit task changes', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const hash = await manager.commitTask('1.1', sampleResult);

      expect(hash).toBe('abc123');
      expect(mockGitClient.add).toHaveBeenCalled();
      expect(mockGitClient.commit).toHaveBeenCalledWith(
        'task-1.1: Implemented the feature successfully'
      );
    });

    it('should return null when no changes', async () => {
      mockGitClient.hasUncommittedChanges.mockResolvedValueOnce(false);

      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const hash = await manager.commitTask('1.1', sampleResult);

      expect(hash).toBeNull();
      expect(mockGitClient.commit).not.toHaveBeenCalled();
    });

    it('should return null when disabled', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      const hash = await manager.commitTask('1.1', sampleResult);

      expect(hash).toBeNull();
      expect(mockGitClient.hasUncommittedChanges).not.toHaveBeenCalled();
    });

    it('should return null when autoCommit disabled', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: false,
      });

      const hash = await manager.commitTask('1.1', sampleResult);

      expect(hash).toBeNull();
      expect(mockGitClient.hasUncommittedChanges).not.toHaveBeenCalled();
    });

    it('should handle missing output_summary', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const result: TaskResult = {
        task_id: '1.1',
        status: 'complete',
        duration_ms: 1000,
      };

      const hash = await manager.commitTask('1.1', result);

      expect(hash).toBe('abc123');
      expect(mockGitClient.commit).toHaveBeenCalledWith('task-1.1: Task completed');
    });
  });

  describe('commitStateChange', () => {
    it('should commit state changes', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const hash = await manager.commitStateChange('phase-1 approved');

      expect(hash).toBe('abc123');
      expect(mockGitClient.add).toHaveBeenCalled();
      expect(mockGitClient.commit).toHaveBeenCalledWith('orchestrator: phase-1 approved');
    });

    it('should return null when no changes', async () => {
      mockGitClient.hasUncommittedChanges.mockResolvedValueOnce(false);

      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const hash = await manager.commitStateChange('action');

      expect(hash).toBeNull();
      expect(mockGitClient.commit).not.toHaveBeenCalled();
    });

    it('should return null when disabled', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      const hash = await manager.commitStateChange('action');

      expect(hash).toBeNull();
    });
  });

  describe('ensureClean', () => {
    it('should commit pending changes', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      await manager.ensureClean();

      expect(mockGitClient.add).toHaveBeenCalled();
      expect(mockGitClient.commit).toHaveBeenCalledWith('orchestrator: save pending changes');
    });

    it('should do nothing when clean', async () => {
      mockGitClient.hasUncommittedChanges.mockResolvedValueOnce(false);

      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      await manager.ensureClean();

      expect(mockGitClient.commit).not.toHaveBeenCalled();
    });

    it('should do nothing when disabled', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      await manager.ensureClean();

      expect(mockGitClient.hasUncommittedChanges).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const branch = await manager.getCurrentBranch();

      expect(branch).toBe('main');
    });

    it('should return null when disabled', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      const branch = await manager.getCurrentBranch();

      expect(branch).toBeNull();
      expect(mockGitClient.getCurrentBranch).not.toHaveBeenCalled();
    });
  });

  describe('hasChanges', () => {
    it('should return true when there are changes', async () => {
      mockGitClient.hasUncommittedChanges.mockResolvedValueOnce(true);

      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const result = await manager.hasChanges();

      expect(result).toBe(true);
    });

    it('should return false when clean', async () => {
      mockGitClient.hasUncommittedChanges.mockResolvedValueOnce(false);

      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const result = await manager.hasChanges();

      expect(result).toBe(false);
    });

    it('should return false when disabled', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      const result = await manager.hasChanges();

      expect(result).toBe(false);
      expect(mockGitClient.hasUncommittedChanges).not.toHaveBeenCalled();
    });
  });

  describe('checkpoint', () => {
    it('should create checkpoint commit', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const hash = await manager.checkpoint('before risky operation');

      expect(hash).toBe('abc123');
      expect(mockGitClient.add).toHaveBeenCalled();
      expect(mockGitClient.commit).toHaveBeenCalledWith('checkpoint: before risky operation');
    });

    it('should return null when no changes', async () => {
      mockGitClient.hasUncommittedChanges.mockResolvedValueOnce(false);

      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: true,
        autoCommit: true,
      });

      const hash = await manager.checkpoint('test');

      expect(hash).toBeNull();
    });

    it('should return null when disabled', async () => {
      const manager = new GitWorkflowManager({
        gitClient: mockGitClient as unknown as GitClient,
        enabled: false,
        autoCommit: true,
      });

      const hash = await manager.checkpoint('test');

      expect(hash).toBeNull();
    });
  });
});
