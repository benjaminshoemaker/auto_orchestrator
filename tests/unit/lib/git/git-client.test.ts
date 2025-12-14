import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitClient } from '../../../../src/lib/git/git-client.js';

// Mock simple-git
vi.mock('simple-git', () => {
  return {
    default: vi.fn().mockReturnValue({
      revparse: vi.fn().mockResolvedValue('true'),
      init: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({
        isClean: () => true,
        modified: [],
        created: [],
        deleted: [],
        staged: [],
        current: 'main',
        tracking: 'origin/main',
      }),
      branch: vi.fn().mockResolvedValue({
        all: ['main', 'develop'],
        current: 'main',
      }),
      checkoutLocalBranch: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue({ commit: 'abc123' }),
      log: vi.fn().mockResolvedValue({
        all: [
          {
            hash: 'abc123',
            message: 'Initial commit',
            author_name: 'Test',
            date: '2024-01-01',
          },
        ],
      }),
      diff: vi.fn().mockResolvedValue('diff output'),
      stash: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      merge: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

import simpleGit from 'simple-git';

describe('GitClient', () => {
  let client: GitClient;
  let mockGit: ReturnType<typeof simpleGit>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitClient('/test/dir');
    mockGit = vi.mocked(simpleGit).mock.results[0].value;
  });

  describe('isRepo', () => {
    it('should return true for valid repo', async () => {
      const result = await client.isRepo();
      expect(result).toBe(true);
      expect(mockGit.revparse).toHaveBeenCalledWith(['--is-inside-work-tree']);
    });

    it('should return false when not a repo', async () => {
      mockGit.revparse.mockRejectedValueOnce(new Error('Not a repo'));

      const result = await client.isRepo();
      expect(result).toBe(false);
    });
  });

  describe('init', () => {
    it('should initialize git repository', async () => {
      await client.init();
      expect(mockGit.init).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return git status', async () => {
      const status = await client.getStatus();

      expect(status.isClean).toBe(true);
      expect(status.currentBranch).toBe('main');
      expect(status.tracking).toBe('origin/main');
    });

    it('should return dirty status', async () => {
      mockGit.status.mockResolvedValueOnce({
        isClean: () => false,
        modified: ['file1.ts'],
        created: ['file2.ts'],
        deleted: [],
        staged: ['file1.ts'],
        current: 'feature',
        tracking: null,
      });

      const status = await client.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.modified).toContain('file1.ts');
      expect(status.created).toContain('file2.ts');
      expect(status.staged).toContain('file1.ts');
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch', async () => {
      mockGit.revparse.mockResolvedValueOnce('feature-branch\n');

      const branch = await client.getCurrentBranch();
      expect(branch).toBe('feature-branch');
    });

    it('should return null on error', async () => {
      mockGit.revparse.mockRejectedValueOnce(new Error('Error'));

      const branch = await client.getCurrentBranch();
      expect(branch).toBeNull();
    });
  });

  describe('branchExists', () => {
    it('should return true if branch exists', async () => {
      const result = await client.branchExists('develop');
      expect(result).toBe(true);
    });

    it('should return false if branch does not exist', async () => {
      const result = await client.branchExists('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('createBranch', () => {
    it('should create and checkout branch', async () => {
      await client.createBranch('new-feature');
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('new-feature');
    });
  });

  describe('checkout', () => {
    it('should checkout branch', async () => {
      await client.checkout('develop');
      expect(mockGit.checkout).toHaveBeenCalledWith('develop');
    });
  });

  describe('add', () => {
    it('should stage files', async () => {
      await client.add(['file1.ts', 'file2.ts']);
      expect(mockGit.add).toHaveBeenCalledWith(['file1.ts', 'file2.ts']);
    });

    it('should default to all files', async () => {
      await client.add();
      expect(mockGit.add).toHaveBeenCalledWith('.');
    });
  });

  describe('commit', () => {
    it('should commit changes', async () => {
      const hash = await client.commit('Test commit');

      expect(hash).toBe('abc123');
      expect(mockGit.commit).toHaveBeenCalledWith('Test commit');
    });
  });

  describe('getLog', () => {
    it('should return commit log', async () => {
      const log = await client.getLog(5);

      expect(log).toHaveLength(1);
      expect(log[0].hash).toBe('abc123');
      expect(log[0].message).toBe('Initial commit');
      expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 5 });
    });
  });

  describe('getDiff', () => {
    it('should return unstaged diff', async () => {
      const diff = await client.getDiff();
      expect(diff).toBe('diff output');
      expect(mockGit.diff).toHaveBeenCalledWith();
    });
  });

  describe('getStagedDiff', () => {
    it('should return staged diff', async () => {
      const diff = await client.getStagedDiff();
      expect(mockGit.diff).toHaveBeenCalledWith(['--staged']);
    });
  });

  describe('stash', () => {
    it('should stash changes', async () => {
      await client.stash();
      expect(mockGit.stash).toHaveBeenCalled();
    });

    it('should stash with message', async () => {
      await client.stash('WIP');
      expect(mockGit.stash).toHaveBeenCalledWith(['push', '-m', 'WIP']);
    });
  });

  describe('stashPop', () => {
    it('should pop stash', async () => {
      await client.stashPop();
      expect(mockGit.stash).toHaveBeenCalledWith(['pop']);
    });
  });

  describe('reset', () => {
    it('should reset to commit', async () => {
      await client.reset('HEAD~1', 'hard');
      expect(mockGit.reset).toHaveBeenCalledWith(['--hard', 'HEAD~1']);
    });

    it('should default to mixed reset to HEAD', async () => {
      await client.reset();
      expect(mockGit.reset).toHaveBeenCalledWith(['--mixed', 'HEAD']);
    });
  });

  describe('merge', () => {
    it('should merge branch', async () => {
      await client.merge('feature');
      expect(mockGit.merge).toHaveBeenCalledWith(['feature']);
    });

    it('should merge with no-ff option', async () => {
      await client.merge('feature', { noFf: true });
      expect(mockGit.merge).toHaveBeenCalledWith(['--no-ff', 'feature']);
    });
  });

  describe('push', () => {
    it('should push to remote', async () => {
      await client.push('origin', 'main');
      expect(mockGit.push).toHaveBeenCalledWith('origin', 'main');
    });

    it('should default to origin', async () => {
      await client.push();
      expect(mockGit.push).toHaveBeenCalledWith('origin');
    });
  });

  describe('pull', () => {
    it('should pull from remote', async () => {
      await client.pull('origin', 'main');
      expect(mockGit.pull).toHaveBeenCalledWith('origin', 'main');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false when clean', async () => {
      const result = await client.hasUncommittedChanges();
      expect(result).toBe(false);
    });

    it('should return true when dirty', async () => {
      mockGit.status.mockResolvedValueOnce({
        isClean: () => false,
        modified: ['file.ts'],
        created: [],
        deleted: [],
        staged: [],
        current: 'main',
        tracking: null,
      });

      const result = await client.hasUncommittedChanges();
      expect(result).toBe(true);
    });
  });

  describe('getRawGit', () => {
    it('should return underlying simple-git instance', () => {
      const raw = client.getRawGit();
      expect(raw).toBe(mockGit);
    });
  });
});
