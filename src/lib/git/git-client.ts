/**
 * Git Client
 * Wrapper around simple-git for common git operations
 */

import simpleGit, { SimpleGit, StatusResult, LogResult } from 'simple-git';

export interface GitStatus {
  isClean: boolean;
  modified: string[];
  created: string[];
  deleted: string[];
  staged: string[];
  currentBranch: string | null;
  tracking: string | null;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

/**
 * Wrapper for git operations using simple-git
 */
export class GitClient {
  private git: SimpleGit;

  constructor(private workDir: string) {
    this.git = simpleGit(workDir);
  }

  /**
   * Check if directory is a git repository
   */
  async isRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a new git repository
   */
  async init(): Promise<void> {
    await this.git.init();
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<GitStatus> {
    const status: StatusResult = await this.git.status();

    return {
      isClean: status.isClean(),
      modified: status.modified,
      created: status.created,
      deleted: status.deleted,
      staged: status.staged,
      currentBranch: status.current,
      tracking: status.tracking,
    };
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string | null> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch {
      return null;
    }
  }

  /**
   * Check if branch exists
   */
  async branchExists(branch: string): Promise<boolean> {
    try {
      const branches = await this.git.branch();
      return branches.all.includes(branch);
    } catch {
      return false;
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(name: string): Promise<void> {
    await this.git.checkoutLocalBranch(name);
  }

  /**
   * Checkout a branch
   */
  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  /**
   * Stage files
   */
  async add(files: string | string[] = '.'): Promise<void> {
    await this.git.add(files);
  }

  /**
   * Commit staged changes
   */
  async commit(message: string): Promise<string> {
    const result = await this.git.commit(message);
    return result.commit;
  }

  /**
   * Get recent commits
   */
  async getLog(limit: number = 10): Promise<GitCommit[]> {
    const log: LogResult = await this.git.log({ maxCount: limit });

    return log.all.map((entry) => ({
      hash: entry.hash,
      message: entry.message,
      author: entry.author_name,
      date: entry.date,
    }));
  }

  /**
   * Get diff of unstaged changes
   */
  async getDiff(): Promise<string> {
    return this.git.diff();
  }

  /**
   * Get diff of staged changes
   */
  async getStagedDiff(): Promise<string> {
    return this.git.diff(['--staged']);
  }

  /**
   * Stash changes
   */
  async stash(message?: string): Promise<void> {
    if (message) {
      await this.git.stash(['push', '-m', message]);
    } else {
      await this.git.stash();
    }
  }

  /**
   * Pop stash
   */
  async stashPop(): Promise<void> {
    await this.git.stash(['pop']);
  }

  /**
   * Reset to a commit
   */
  async reset(commit: string = 'HEAD', mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<void> {
    await this.git.reset([`--${mode}`, commit]);
  }

  /**
   * Merge a branch into current branch
   */
  async merge(branch: string, options?: { noFf?: boolean }): Promise<void> {
    const args = [branch];
    if (options?.noFf) {
      args.unshift('--no-ff');
    }
    await this.git.merge(args);
  }

  /**
   * Push to remote
   */
  async push(remote: string = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.push(remote, branch);
    } else {
      await this.git.push(remote);
    }
  }

  /**
   * Pull from remote
   */
  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.pull(remote, branch);
    } else {
      await this.git.pull(remote);
    }
  }

  /**
   * Check for uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.getStatus();
    return !status.isClean;
  }

  /**
   * Get the simple-git instance for advanced operations
   */
  getRawGit(): SimpleGit {
    return this.git;
  }
}
