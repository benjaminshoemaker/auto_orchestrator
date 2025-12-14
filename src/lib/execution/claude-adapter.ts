/**
 * Claude Code Adapter
 * Wrapper for spawning Claude CLI for task execution
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ClaudeAdapterOptions {
  cliPath?: string;
  cwd?: string;
  timeout?: number;
  maxTokens?: number;
}

export interface ClaudeExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
}

export interface ClaudeEvent {
  type: 'stdout' | 'stderr' | 'exit' | 'error';
  data?: string;
  exitCode?: number;
  error?: Error;
}

/**
 * Adapter for Claude CLI execution
 * Spawns the claude CLI with prompts and captures output
 */
export class ClaudeAdapter extends EventEmitter {
  private options: Required<ClaudeAdapterOptions>;
  private process: ChildProcess | null = null;

  constructor(options: ClaudeAdapterOptions = {}) {
    super();
    this.options = {
      cliPath: options.cliPath || 'claude',
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 300000, // 5 minutes default
      maxTokens: options.maxTokens || 4096,
    };
  }

  /**
   * Execute a prompt with Claude CLI
   */
  async execute(prompt: string): Promise<ClaudeExecutionResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let hasTimedOut = false;

      // Spawn claude with --print flag to output to stdout
      this.process = spawn(
        this.options.cliPath,
        ['--print', '--max-turns', '1', '-p', prompt],
        {
          cwd: this.options.cwd,
          shell: true,
          env: {
            ...process.env,
            CLAUDE_MAX_TOKENS: String(this.options.maxTokens),
          },
        }
      );

      // Set timeout
      const timeoutId = setTimeout(() => {
        hasTimedOut = true;
        this.abort();
      }, this.options.timeout);

      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        this.emit('event', { type: 'stdout', data: text } as ClaudeEvent);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        this.emit('event', { type: 'stderr', data: text } as ClaudeEvent);
      });

      this.process.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        this.emit('event', { type: 'error', error } as ClaudeEvent);
        resolve({
          success: false,
          output: stdout,
          error: error.message,
          exitCode: -1,
          duration: Date.now() - startTime,
        });
      });

      this.process.on('close', (code: number | null) => {
        clearTimeout(timeoutId);
        const exitCode = code ?? -1;

        this.emit('event', { type: 'exit', exitCode } as ClaudeEvent);
        this.process = null;

        if (hasTimedOut) {
          resolve({
            success: false,
            output: stdout,
            error: 'Execution timed out',
            exitCode: -1,
            duration: Date.now() - startTime,
          });
        } else {
          resolve({
            success: exitCode === 0,
            output: stdout,
            error: stderr || undefined,
            exitCode,
            duration: Date.now() - startTime,
          });
        }
      });
    });
  }

  /**
   * Execute a prompt with streaming output
   */
  executeStream(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<ClaudeExecutionResult> {
    const originalListener = (event: ClaudeEvent) => {
      if (event.type === 'stdout' && event.data) {
        onChunk(event.data);
      }
    };

    this.on('event', originalListener);

    return this.execute(prompt).finally(() => {
      this.off('event', originalListener);
    });
  }

  /**
   * Abort the current execution
   */
  abort(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  /**
   * Check if an execution is in progress
   */
  isRunning(): boolean {
    return this.process !== null;
  }

  /**
   * Build a task execution prompt
   */
  static buildTaskPrompt(
    taskDescription: string,
    acceptanceCriteria: string[],
    context?: string
  ): string {
    let prompt = `## Task\n${taskDescription}\n\n`;
    prompt += `## Acceptance Criteria\n`;
    acceptanceCriteria.forEach((criterion, i) => {
      prompt += `${i + 1}. ${criterion}\n`;
    });
    if (context) {
      prompt += `\n## Context\n${context}\n`;
    }
    prompt += `\n## Instructions\n`;
    prompt += `Complete the task above. Focus on the acceptance criteria.\n`;
    prompt += `When finished, summarize what was done.\n`;
    return prompt;
  }

  /**
   * Check if Claude CLI is available
   */
  static async isAvailable(cliPath: string = 'claude'): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn(cliPath, ['--version'], { shell: true });
      check.on('error', () => resolve(false));
      check.on('close', (code) => resolve(code === 0));
    });
  }
}
