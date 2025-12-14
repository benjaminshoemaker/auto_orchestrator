/**
 * Task Executor
 * Executes individual tasks using Claude Code adapter
 */

import type { Task, TaskResult, TaskStatus } from '../../types/index.js';
import { ClaudeAdapter, type ClaudeExecutionResult } from './claude-adapter.js';
import {
  buildTaskPrompt,
  buildValidationPrompt,
  buildRetryPrompt,
  type TaskContext,
} from './prompt-builder.js';
import {
  parseTaskOutput,
  parseValidationOutput,
  toTaskResult,
  type ParsedTaskResult,
} from './result-parser.js';
import type { GitWorkflowManager } from '../git/workflow-manager.js';
import * as terminal from '../ui/terminal.js';
import { EventEmitter } from 'events';

export interface TaskExecutorOptions {
  cliPath?: string;
  timeout?: number;
  validateResults?: boolean;
  maxRetries?: number;
  onProgress?: (chunk: string) => void;
  gitWorkflow?: GitWorkflowManager;
}

export interface TaskExecutionEvent {
  type: 'start' | 'progress' | 'validate' | 'complete' | 'retry' | 'fail';
  taskId: string;
  message?: string;
  result?: TaskResult;
}

/**
 * Executes a single task using Claude Code
 */
export class TaskExecutor extends EventEmitter {
  private adapter: ClaudeAdapter;
  private options: Required<Omit<TaskExecutorOptions, 'gitWorkflow'>> & { gitWorkflow?: GitWorkflowManager };

  constructor(
    private context: TaskContext,
    options: TaskExecutorOptions = {}
  ) {
    super();
    this.options = {
      cliPath: options.cliPath || 'claude',
      timeout: options.timeout || 300000,
      validateResults: options.validateResults ?? true,
      maxRetries: options.maxRetries || 2,
      onProgress: options.onProgress || (() => {}),
      gitWorkflow: options.gitWorkflow,
    };

    this.adapter = new ClaudeAdapter({
      cliPath: this.options.cliPath,
      cwd: process.cwd(),
      timeout: this.options.timeout,
    });
  }

  /**
   * Execute a task
   */
  async execute(task: Task): Promise<TaskResult> {
    this.emitEvent('start', task.id, `Starting task ${task.id}`);
    terminal.printInfo(`Executing task ${task.id}: ${task.description}`);

    // Build prompt
    const prompt = buildTaskPrompt(task, this.context);

    // Execute with streaming
    const execResult = await this.adapter.executeStream(prompt, (chunk) => {
      this.options.onProgress(chunk);
      this.emitEvent('progress', task.id, chunk);
    });

    // Parse result
    const parsed = parseTaskOutput(execResult.output);

    // Validate if enabled and execution succeeded
    if (this.options.validateResults && parsed.success) {
      this.emitEvent('validate', task.id, 'Validating task completion');
      const validationResult = await this.validate(task, execResult.output);

      if (!validationResult.passed) {
        parsed.success = false;
        parsed.summary = `Validation failed: ${validationResult.summary}`;
      }
    }

    // Convert to TaskResult
    const result = toTaskResult(task.id, parsed, execResult.duration);

    if (result.status === 'complete') {
      this.emitEvent('complete', task.id, `Task ${task.id} completed`, result);
      terminal.printSuccess(`Task ${task.id} completed`);

      // Commit if git workflow enabled
      if (this.options.gitWorkflow) {
        const commitHash = await this.options.gitWorkflow.commitTask(task.id, result);
        if (commitHash) {
          result.commit_hash = commitHash;
        }
      }
    } else {
      this.emitEvent('fail', task.id, `Task ${task.id} failed`, result);
      terminal.printError(`Task ${task.id} failed: ${result.output_summary}`);
    }

    return result;
  }

  /**
   * Execute a task with retry on failure
   */
  async executeWithRetry(task: Task): Promise<TaskResult> {
    let lastResult: TaskResult | null = null;
    let attempts = 0;

    while (attempts <= this.options.maxRetries) {
      if (attempts > 0) {
        this.emitEvent(
          'retry',
          task.id,
          `Retrying task ${task.id} (attempt ${attempts + 1})`
        );
        terminal.printWarning(
          `Retrying task ${task.id} (attempt ${attempts + 1}/${this.options.maxRetries + 1})`
        );
      }

      // Build prompt (with retry context if not first attempt)
      let prompt: string;
      if (attempts === 0) {
        prompt = buildTaskPrompt(task, this.context);
      } else {
        prompt = buildRetryPrompt(
          task,
          lastResult?.raw_output || '',
          lastResult?.output_summary || 'Unknown failure',
          this.context
        );
      }

      // Execute
      const execResult = await this.adapter.executeStream(prompt, (chunk) => {
        this.options.onProgress(chunk);
        this.emitEvent('progress', task.id, chunk);
      });

      // Parse
      const parsed = parseTaskOutput(execResult.output);

      // Validate if enabled
      if (this.options.validateResults && parsed.success) {
        const validationResult = await this.validate(task, execResult.output);
        if (!validationResult.passed) {
          parsed.success = false;
          parsed.summary = `Validation failed: ${validationResult.summary}`;
        }
      }

      lastResult = toTaskResult(task.id, parsed, execResult.duration);

      if (lastResult.status === 'complete') {
        this.emitEvent('complete', task.id, `Task ${task.id} completed`, lastResult);
        terminal.printSuccess(`Task ${task.id} completed`);

        // Commit if git workflow enabled
        if (this.options.gitWorkflow) {
          const commitHash = await this.options.gitWorkflow.commitTask(task.id, lastResult);
          if (commitHash) {
            lastResult.commit_hash = commitHash;
          }
        }

        return lastResult;
      }

      attempts++;
    }

    // All retries failed
    this.emitEvent('fail', task.id, `Task ${task.id} failed after ${attempts} attempts`, lastResult!);
    terminal.printError(
      `Task ${task.id} failed after ${attempts} attempts: ${lastResult?.output_summary}`
    );

    return lastResult!;
  }

  /**
   * Validate task completion
   */
  async validate(
    task: Task,
    executionOutput: string
  ): Promise<{ passed: boolean; summary: string }> {
    const validationPrompt = buildValidationPrompt(task, executionOutput);

    const result = await this.adapter.execute(validationPrompt);
    const parsed = parseValidationOutput(result.output);

    return {
      passed: parsed.passed,
      summary: parsed.summary,
    };
  }

  /**
   * Abort current execution
   */
  abort(): void {
    this.adapter.abort();
  }

  /**
   * Check if currently executing
   */
  isRunning(): boolean {
    return this.adapter.isRunning();
  }

  private emitEvent(
    type: TaskExecutionEvent['type'],
    taskId: string,
    message?: string,
    result?: TaskResult
  ): void {
    this.emit('event', { type, taskId, message, result } as TaskExecutionEvent);
  }
}
