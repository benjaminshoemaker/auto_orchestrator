/**
 * Terminal UI utilities for interactive phases
 */

import inquirer from 'inquirer';
import ora, { type Ora } from 'ora';
import chalk from 'chalk';
import type { TaskStatus } from '../../types/index.js';

// === Input ===

/**
 * Prompt for user input
 * Allows multi-line input (empty line submits)
 * Handles Ctrl+C gracefully
 */
export async function prompt(message: string): Promise<string> {
  try {
    const result = await inquirer.prompt<{ input: string }>([
      {
        type: 'input',
        name: 'input',
        message: message,
      },
    ]);
    return result.input;
  } catch (error) {
    // Handle Ctrl+C
    if ((error as Error).message?.includes('User force closed')) {
      process.exit(0);
    }
    throw error;
  }
}

/**
 * Prompt for multi-line input using editor
 */
export async function promptMultiline(message: string): Promise<string> {
  try {
    const result = await inquirer.prompt<{ input: string }>([
      {
        type: 'editor',
        name: 'input',
        message: message,
      },
    ]);
    return result.input;
  } catch (error) {
    if ((error as Error).message?.includes('User force closed')) {
      process.exit(0);
    }
    throw error;
  }
}

/**
 * Yes/no confirmation
 */
export async function confirm(
  message: string,
  defaultValue: boolean = true
): Promise<boolean> {
  try {
    const result = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: message,
        default: defaultValue,
      },
    ]);
    return result.confirmed;
  } catch (error) {
    if ((error as Error).message?.includes('User force closed')) {
      process.exit(0);
    }
    throw error;
  }
}

/**
 * Single selection from list
 */
export async function select<T>(
  message: string,
  choices: { name: string; value: T }[]
): Promise<T> {
  try {
    const result = await inquirer.prompt<{ selection: T }>([
      {
        type: 'list',
        name: 'selection',
        message: message,
        choices: choices,
      },
    ]);
    return result.selection;
  } catch (error) {
    if ((error as Error).message?.includes('User force closed')) {
      process.exit(0);
    }
    throw error;
  }
}

// === Output ===

/**
 * Print bold, underlined header
 */
export function printHeader(title: string): void {
  console.log();
  console.log(chalk.bold.underline(title));
  console.log();
}

/**
 * Print section with title and indented content
 */
export function printSection(title: string, content: string): void {
  console.log(chalk.bold(title + ':'));
  if (content) {
    const lines = content.split('\n');
    lines.forEach((line) => {
      console.log('  ' + line);
    });
  }
  console.log();
}

/**
 * Print success message with green checkmark
 */
export function printSuccess(message: string): void {
  console.log(chalk.green('✔') + ' ' + message);
}

/**
 * Print error message with red X
 */
export function printError(message: string): void {
  console.log(chalk.red('✖') + ' ' + chalk.red(message));
}

/**
 * Print warning message with yellow warning
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow('⚠') + ' ' + chalk.yellow(message));
}

/**
 * Print info message with blue info
 */
export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

// === Progress ===

/**
 * Create ora spinner
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    spinner: 'dots',
  });
}

/**
 * Print progress bar
 * Format: [████░░░░░░] 40% label
 */
export function printProgress(
  current: number,
  total: number,
  label?: string
): void {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;

  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  const percentStr = percentage.toString().padStart(3) + '%';

  const output = `[${bar}] ${percentStr}${label ? ' ' + label : ''}`;
  console.log(output);
}

// === Streaming ===

/**
 * Write token without newline (for LLM streaming)
 */
export function streamToken(token: string): void {
  process.stdout.write(token);
}

/**
 * End streaming line (add newline)
 */
export function endStream(): void {
  console.log();
}

// === Conversation Display ===

/**
 * Format and print assistant message
 */
export function printAssistantMessage(message: string): void {
  console.log(chalk.cyan('🤖 Assistant:'));
  console.log();
  // Word wrap at 80 chars
  const wrapped = wordWrap(message, 80);
  console.log(wrapped);
  console.log();
}

/**
 * Get user prompt string for inquirer
 */
export function printUserPrompt(): string {
  return chalk.green('👤 You:');
}

// === Formatting ===

/**
 * Format cost in USD
 * Format: $1.23
 */
export function formatCost(usd: number): string {
  return '$' + usd.toFixed(2);
}

/**
 * Format duration in seconds
 * Format: 2m 30s or 45s
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format task status with emoji and color
 */
export function formatTaskStatus(status: TaskStatus): string {
  switch (status) {
    case 'pending':
      return chalk.gray('⏳ pending');
    case 'in_progress':
      return chalk.blue('🔄 in progress');
    case 'complete':
      return chalk.green('✅ complete');
    case 'failed':
      return chalk.red('❌ failed');
    case 'skipped':
      return chalk.yellow('⏭️ skipped');
    default:
      return status;
  }
}

// === Helpers ===

/**
 * Word wrap text at specified width
 */
function wordWrap(text: string, width: number): string {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.length <= width) {
      lines.push(paragraph);
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.join('\n');
}
