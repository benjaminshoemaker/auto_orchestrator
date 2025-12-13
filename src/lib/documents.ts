import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ProjectDocument,
  ProjectMeta,
  Task,
  TaskResult,
  ImplementationPhase,
  Approval,
  IdeationContent,
  SpecificationContent,
} from '../types/index.js';
import { DocumentParseError } from '../types/errors.js';
import { parseProjectMd } from './parsers/project-parser.js';
import {
  writeProjectMd,
  updateProjectMeta,
  updateProjectTask,
  updateProjectApproval,
  addImplementationPhase,
} from './writers/project-writer.js';
import { TaskResultManager } from './task-results.js';
import { ClaudeMdManager } from './claude-md.js';
import { logger } from '../utils/logger.js';
import { INITIAL_PROJECT_MD } from '../utils/templates.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Unified facade coordinating all document operations
 */
export class DocumentManager {
  private taskResults: TaskResultManager;
  private claudeMd: ClaudeMdManager;
  private projectMdPath: string;

  constructor(private projectDir: string) {
    this.taskResults = new TaskResultManager(projectDir);
    this.claudeMd = new ClaudeMdManager(projectDir);
    this.projectMdPath = path.join(projectDir, 'PROJECT.md');
  }

  // =====================================
  // Project Document Operations
  // =====================================

  /**
   * Read and parse PROJECT.md
   */
  async readProject(): Promise<ProjectDocument> {
    const content = await fs.readFile(this.projectMdPath, 'utf-8');
    return parseProjectMd(content);
  }

  /**
   * Update PROJECT.md meta fields
   */
  async updateProjectMeta(updates: Partial<ProjectMeta>): Promise<void> {
    const content = await fs.readFile(this.projectMdPath, 'utf-8');
    const updated = updateProjectMeta(content, updates);
    await fs.writeFile(this.projectMdPath, updated, 'utf-8');
    logger.debug('Updated PROJECT.md meta');
  }

  /**
   * Update a specific task
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
    const content = await fs.readFile(this.projectMdPath, 'utf-8');
    const updated = updateProjectTask(content, taskId, updates);
    await fs.writeFile(this.projectMdPath, updated, 'utf-8');
    logger.debug(`Updated task ${taskId}`);
  }

  /**
   * Update or add an approval
   */
  async updateApproval(approval: Approval): Promise<void> {
    const content = await fs.readFile(this.projectMdPath, 'utf-8');
    const updated = updateProjectApproval(
      content,
      approval.phase,
      approval.status,
      approval.notes
    );
    await fs.writeFile(this.projectMdPath, updated, 'utf-8');
    logger.debug(`Updated approval for ${approval.phase}`);
  }

  /**
   * Update ideation content (Phase 1)
   */
  async updateIdeation(content: IdeationContent): Promise<void> {
    const doc = await this.readProject();
    doc.ideation = content;
    const output = writeProjectMd(doc);
    await fs.writeFile(this.projectMdPath, output, 'utf-8');
    logger.debug('Updated ideation content');
  }

  /**
   * Update specification content (Phase 2)
   */
  async updateSpecification(content: SpecificationContent): Promise<void> {
    const doc = await this.readProject();
    doc.specification = content;
    const output = writeProjectMd(doc);
    await fs.writeFile(this.projectMdPath, output, 'utf-8');
    logger.debug('Updated specification content');
  }

  /**
   * Add a new implementation phase
   */
  async addImplementationPhase(phase: ImplementationPhase): Promise<void> {
    const content = await fs.readFile(this.projectMdPath, 'utf-8');
    const updated = addImplementationPhase(content, phase);
    await fs.writeFile(this.projectMdPath, updated, 'utf-8');
    logger.debug(`Added implementation phase: ${phase.name}`);
  }

  // =====================================
  // Task Results Operations
  // =====================================

  /**
   * Save a task result
   */
  async saveTaskResult(result: TaskResult): Promise<void> {
    await this.taskResults.writeResult(result);
  }

  /**
   * Get a task result by ID
   */
  async getTaskResult(taskId: string): Promise<TaskResult | null> {
    return this.taskResults.readResult(taskId);
  }

  /**
   * Get all task results
   */
  async getAllTaskResults(): Promise<TaskResult[]> {
    return this.taskResults.readAllResults();
  }

  /**
   * Delete a task result (used for retry)
   */
  async deleteTaskResult(taskId: string): Promise<boolean> {
    return this.taskResults.deleteResult(taskId);
  }

  /**
   * Get cost summary from all task results
   */
  async getCostSummary(): Promise<{ tokens: number; cost: number }> {
    const [tokens, cost] = await Promise.all([
      this.taskResults.getTotalTokens(),
      this.taskResults.getTotalCost(),
    ]);
    return { tokens, cost };
  }

  // =====================================
  // CLAUDE.md Operations
  // =====================================

  /**
   * Build a complete task prompt including dependencies
   */
  async buildTaskPrompt(task: Task, phase: ImplementationPhase): Promise<string> {
    // Get results for all dependencies
    const dependencyResults: TaskResult[] = [];

    for (const depId of task.depends_on) {
      const result = await this.taskResults.readResult(depId);
      if (result) {
        dependencyResults.push(result);
      }
    }

    return this.claudeMd.buildTaskContext({
      task,
      phase,
      dependencyResults,
    });
  }

  // =====================================
  // Initialization
  // =====================================

  /**
   * Initialize a new project directory with all required files
   */
  async initialize(projectName: string, description: string): Promise<void> {
    // Check if already exists
    try {
      await fs.access(this.projectMdPath);
      throw DocumentParseError.invalidStructure('PROJECT.md already exists');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Create directory structure
    await fs.mkdir(path.join(this.projectDir, 'tasks', 'results'), { recursive: true });

    // Create PROJECT.md from template
    const projectId = `${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const projectMd = INITIAL_PROJECT_MD
      .replace('{{PROJECT_NAME}}', projectName)
      .replace('{{PROJECT_ID}}', projectId)
      .replace(/\{\{NOW\}\}/g, now);

    await fs.writeFile(this.projectMdPath, projectMd, 'utf-8');

    // Create CLAUDE.md
    await this.claudeMd.initialize(projectName, description);

    logger.debug(`Initialized project: ${projectName}`);
  }

  // =====================================
  // Validation
  // =====================================

  /**
   * Validate project structure and consistency
   */
  async validate(): Promise<ValidationResult> {
    const issues: string[] = [];

    // Check PROJECT.md exists and is valid
    try {
      await this.readProject();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        issues.push('PROJECT.md not found');
      } else {
        issues.push(`PROJECT.md parse error: ${(error as Error).message}`);
      }
    }

    // Check CLAUDE.md exists
    if (!(await this.claudeMd.exists())) {
      issues.push('CLAUDE.md not found');
    }

    // Check tasks directory exists
    const tasksDir = path.join(this.projectDir, 'tasks');
    try {
      await fs.access(tasksDir);
    } catch {
      issues.push('tasks/ directory not found');
    }

    // Validate task results match tasks in PROJECT.md
    try {
      const doc = await this.readProject();
      const results = await this.getAllTaskResults();
      const resultIds = new Set(results.map((r) => r.task_id));

      // Check for orphaned results (result without task)
      const allTaskIds = new Set<string>();
      for (const phase of doc.implementation_phases) {
        for (const task of phase.tasks) {
          allTaskIds.add(task.id);
        }
      }

      for (const resultId of resultIds) {
        if (!allTaskIds.has(resultId)) {
          issues.push(`Orphaned task result: ${resultId} (task not in PROJECT.md)`);
        }
      }

      // Check for completed tasks without results
      for (const phase of doc.implementation_phases) {
        for (const task of phase.tasks) {
          if (task.status === 'complete' && !resultIds.has(task.id)) {
            issues.push(`Task ${task.id} marked complete but no result file found`);
          }
        }
      }
    } catch {
      // Already logged PROJECT.md issues above
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
