/**
 * Git Workflow Manager
 * Manages Git workflow for the orchestrator
 */

import { GitClient } from './git-client.js';
import type { TaskResult } from '../../types/index.js';

export interface WorkflowConfig {
  gitClient: GitClient;
  enabled: boolean;
  autoCommit: boolean;
  branchPrefix?: string;
}

/**
 * Manages Git workflow for implementation phases
 */
export class GitWorkflowManager {
  private config: Required<WorkflowConfig>;

  constructor(config: WorkflowConfig) {
    this.config = {
      gitClient: config.gitClient,
      enabled: config.enabled,
      autoCommit: config.autoCommit,
      branchPrefix: config.branchPrefix || 'impl',
    };
  }

  /**
   * Check if Git operations should run
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Format a branch name for an implementation phase
   */
  formatBranchName(phaseNumber: number, phaseName: string): string {
    const slug = phaseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${this.config.branchPrefix}/phase-${phaseNumber}-${slug}`;
  }

  /**
   * Format a commit message
   */
  formatCommitMessage(type: string, description: string): string {
    // Truncate description to 72 chars
    const truncated = description.length > 72 ? description.substring(0, 69) + '...' : description;
    return `${type}: ${truncated}`;
  }

  /**
   * Start a new implementation phase branch
   */
  async startImplPhase(phaseNumber: number, phaseName: string): Promise<string | null> {
    if (!this.config.enabled) return null;

    const branchName = this.formatBranchName(phaseNumber, phaseName);

    // Check if branch already exists
    if (await this.config.gitClient.branchExists(branchName)) {
      await this.config.gitClient.checkout(branchName);
    } else {
      await this.config.gitClient.createBranch(branchName);
    }

    return branchName;
  }

  /**
   * Commit after task completion
   */
  async commitTask(taskId: string, result: TaskResult): Promise<string | null> {
    if (!this.config.enabled || !this.config.autoCommit) return null;

    const hasChanges = await this.config.gitClient.hasUncommittedChanges();
    if (!hasChanges) return null;

    // Stage all changes
    await this.config.gitClient.add();

    const summary = result.output_summary || 'Task completed';
    const message = this.formatCommitMessage(`task-${taskId}`, summary.substring(0, 72));

    const hash = await this.config.gitClient.commit(message);
    return hash;
  }

  /**
   * Commit state changes
   */
  async commitStateChange(action: string): Promise<string | null> {
    if (!this.config.enabled || !this.config.autoCommit) return null;

    const hasChanges = await this.config.gitClient.hasUncommittedChanges();
    if (!hasChanges) return null;

    // Stage all changes
    await this.config.gitClient.add();

    const message = this.formatCommitMessage('orchestrator', action);
    const hash = await this.config.gitClient.commit(message);
    return hash;
  }

  /**
   * Ensure working directory is clean before operations
   */
  async ensureClean(): Promise<void> {
    if (!this.config.enabled) return;

    const hasChanges = await this.config.gitClient.hasUncommittedChanges();
    if (hasChanges) {
      // Stage all changes
      await this.config.gitClient.add();
      // Auto-commit pending changes
      await this.config.gitClient.commit('orchestrator: save pending changes');
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string | null> {
    if (!this.config.enabled) return null;
    return this.config.gitClient.getCurrentBranch();
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasChanges(): Promise<boolean> {
    if (!this.config.enabled) return false;
    return this.config.gitClient.hasUncommittedChanges();
  }

  /**
   * Create a checkpoint commit (manual save point)
   */
  async checkpoint(message: string): Promise<string | null> {
    if (!this.config.enabled) return null;

    const hasChanges = await this.config.gitClient.hasUncommittedChanges();
    if (!hasChanges) return null;

    await this.config.gitClient.add();
    const hash = await this.config.gitClient.commit(`checkpoint: ${message}`);
    return hash;
  }
}
