#!/usr/bin/env node

import { Command } from 'commander';
import { VERSION } from './constants.js';
import { setVerbose } from './utils/logger.js';
import { initCommand, type InitOptions } from './commands/init.js';
import { resumeCommand, type ResumeOptions } from './commands/resume.js';
import { statusCommand, type StatusOptions } from './commands/status.js';
import { approveCommand, type ApproveOptions } from './commands/approve.js';
import { skipCommand, type SkipOptions } from './commands/skip.js';
import { retryCommand, type RetryOptions } from './commands/retry.js';
import { configCommand, type ConfigOptions } from './commands/config.js';

export { VERSION };

const program = new Command();

program
  .name('orchestrator')
  .description('Autonomous development orchestrator CLI')
  .version(VERSION, '-V, --version', 'Show version number')
  .option('--verbose', 'Enable verbose logging')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
    }
  });

// init command
program
  .command('init')
  .description('Start a new project from an idea')
  .argument('<idea>', 'The initial idea for your project')
  .option('-d, --dir <path>', 'Project directory (default: current)')
  .option('-n, --name <name>', 'Project name (default: slugified idea)')
  .action(async (idea: string, options: InitOptions) => {
    await initCommand(idea, options);
  });

// resume command
program
  .command('resume')
  .description('Resume an existing project')
  .option('-d, --dir <path>', 'Project directory')
  .action(async (options: ResumeOptions) => {
    await resumeCommand(options);
  });

// status command
program
  .command('status')
  .description('Show project status')
  .option('-d, --dir <path>', 'Project directory')
  .option('--json', 'Output as JSON')
  .action(async (options: StatusOptions) => {
    await statusCommand(options);
  });

// approve command
program
  .command('approve')
  .description('Approve a completed phase')
  .argument('<phase>', 'Phase to approve (phase-1, phase-2, phase-3, or impl-N)')
  .option('-d, --dir <path>', 'Project directory')
  .option('--notes <text>', 'Approval notes')
  .action(async (phase: string, options: ApproveOptions) => {
    await approveCommand(phase, options);
  });

// skip command
program
  .command('skip')
  .description('Skip a task')
  .argument('<task-id>', 'Task ID to skip (e.g., "2.3")')
  .option('-d, --dir <path>', 'Project directory')
  .requiredOption('-r, --reason <text>', 'Reason for skipping (required)')
  .action(async (taskId: string, options: SkipOptions) => {
    await skipCommand(taskId, options);
  });

// retry command
program
  .command('retry')
  .description('Retry a failed task')
  .argument('<task-id>', 'Task ID to retry (e.g., "2.3")')
  .option('-d, --dir <path>', 'Project directory')
  .action(async (taskId: string, options: RetryOptions) => {
    await retryCommand(taskId, options);
  });

// config command
program
  .command('config')
  .description('View or modify configuration')
  .option('-d, --dir <path>', 'Project directory')
  .option('--set <key=value>', 'Set a config value')
  .option('--get <key>', 'Get a config value')
  .action(async (options: ConfigOptions) => {
    await configCommand(options);
  });

// Parse command line arguments
program.parse();
