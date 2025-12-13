import chalk from 'chalk';

let verboseEnabled = false;

/**
 * Set verbose logging mode
 */
export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

/**
 * Check if verbose mode is enabled
 */
export function isVerbose(): boolean {
  return verboseEnabled;
}

/**
 * Logger utility for consistent console output
 */
export const logger = {
  /**
   * Normal output
   */
  log(message: string): void {
    console.log(message);
  },

  /**
   * Info message (blue)
   */
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  },

  /**
   * Success message (green)
   */
  success(message: string): void {
    console.log(chalk.green('✓'), message);
  },

  /**
   * Warning message (yellow)
   */
  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  },

  /**
   * Error message (red)
   */
  error(message: string): void {
    console.log(chalk.red('✗'), message);
  },

  /**
   * Verbose message (gray) - only shown if verbose mode enabled
   */
  verbose(message: string): void {
    if (verboseEnabled) {
      console.log(chalk.gray(message));
    }
  },

  /**
   * Debug message (dim) - only shown if DEBUG env var set
   */
  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.dim(`[DEBUG] ${message}`));
    }
  },
};
