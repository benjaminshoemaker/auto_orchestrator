import { findProjectRoot } from '../utils/project.js';
import { DocumentManager } from '../lib/documents.js';
import { StateManager } from '../lib/state/state-manager.js';
import * as terminal from '../lib/ui/terminal.js';

export interface RetryOptions {
  dir?: string;
}

export async function retryCommand(taskId: string, options: RetryOptions): Promise<void> {
  const projectDir = findProjectRoot(options.dir);
  if (!projectDir) {
    terminal.printError('Not in an orchestrator project.');
    process.exit(1);
  }

  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();

  // Find the task
  const task = stateManager.getTask(taskId);
  if (!task) {
    terminal.printError(`Task ${taskId} not found.`);
    process.exit(1);
  }

  // Check task is failed
  if (task.status !== 'failed') {
    terminal.printError(
      `Task ${taskId} is not in failed status (current: ${task.status}).`
    );
    terminal.printInfo('Only failed tasks can be retried.');
    process.exit(1);
  }

  // Show task info
  terminal.printSection(`Task ${taskId}`, task.description);
  if (task.failure_reason) {
    terminal.printWarning(`Previous failure: ${task.failure_reason}`);
  }

  // Confirm retry
  const confirmed = await terminal.confirm(
    'Reset this task to pending and retry?',
    true
  );
  if (!confirmed) {
    terminal.printInfo('Retry cancelled.');
    return;
  }

  // Reset task to pending
  await stateManager.retryTask(taskId);
  await stateManager.save();

  terminal.printSuccess(`Task ${taskId} reset to pending.`);
  terminal.printInfo('Run "orchestrator resume" to continue execution.');
}
