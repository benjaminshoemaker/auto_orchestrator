import { findProjectRoot } from '../utils/project.js';
import { DocumentManager } from '../lib/documents.js';
import { StateManager } from '../lib/state/state-manager.js';
import * as terminal from '../lib/ui/terminal.js';

export interface SkipOptions {
  dir?: string;
  reason: string;
}

export async function skipCommand(taskId: string, options: SkipOptions): Promise<void> {
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

  // Check task is not already complete or skipped
  if (task.status === 'complete') {
    terminal.printError(`Task ${taskId} is already complete.`);
    process.exit(1);
  }
  if (task.status === 'skipped') {
    terminal.printError(`Task ${taskId} is already skipped.`);
    process.exit(1);
  }

  // Show task info
  terminal.printSection(`Task ${taskId}`, task.description);
  if (task.acceptance_criteria.length > 0) {
    terminal.printInfo(`Acceptance criteria: ${task.acceptance_criteria.length} items`);
  }

  // Require a reason
  const reason = options.reason || 'No reason provided';

  // Confirm skip
  const confirmed = await terminal.confirm(
    `Skip this task with reason: "${reason}"?`,
    false
  );
  if (!confirmed) {
    terminal.printInfo('Skip cancelled.');
    return;
  }

  // Skip the task
  stateManager.skipTask(taskId, reason);
  await stateManager.save();

  terminal.printSuccess(`Task ${taskId} skipped.`);
  terminal.printInfo('Run "orchestrator resume" to continue execution.');
}
