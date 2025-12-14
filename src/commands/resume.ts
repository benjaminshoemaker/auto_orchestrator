import { findProjectRoot } from '../utils/project.js';
import { DocumentManager } from '../lib/documents.js';
import { StateManager } from '../lib/state/state-manager.js';
import { PhaseManager } from '../lib/state/phase-manager.js';
import { LLMService } from '../lib/llm/llm-service.js';
import { IdeationPhase } from '../lib/phases/ideation-phase.js';
import { SpecPhase } from '../lib/phases/spec-phase.js';
import { PlanningPhase } from '../lib/phases/planning-phase.js';
import * as terminal from '../lib/ui/terminal.js';

export interface ResumeOptions {
  dir?: string;
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  const projectDir = findProjectRoot(options.dir);
  if (!projectDir) {
    terminal.printError('Not in an orchestrator project.');
    terminal.printInfo('Run "orchestrator init <idea>" to start a new project.');
    process.exit(1);
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    terminal.printError('ANTHROPIC_API_KEY environment variable not set');
    terminal.printInfo('Set it with: export ANTHROPIC_API_KEY=your-key');
    terminal.printInfo('Or add it to .env.local file');
    process.exit(1);
  }

  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();

  const phaseManager = new PhaseManager(stateManager);
  const meta = stateManager.getMeta();
  const llmService = new LLMService({});

  const config = { llmService, stateManager, documentManager };

  // Check for failed tasks that need attention
  const failedTasks = stateManager.getFailedTasks();
  if (failedTasks.length > 0) {
    terminal.printWarning(`${failedTasks.length} failed task(s) found:`);
    failedTasks.forEach((t) => {
      terminal.printWarning(`  ${t.id}: ${t.description}`);
      if (t.failure_reason) {
        terminal.printWarning(`    Reason: ${t.failure_reason}`);
      }
    });
    terminal.printInfo('');
    terminal.printInfo('Options:');
    terminal.printInfo('  orchestrator retry <task-id>  - Retry a failed task');
    terminal.printInfo('  orchestrator skip <task-id> --reason "..."  - Skip a task');
    return;
  }

  // Phase 1 not complete?
  if (!meta.gates.ideation_complete) {
    terminal.printInfo('Resuming Phase 1: Idea Refinement');
    const doc = stateManager.getProject();
    const idea = doc.meta.project_name;

    const result = await new IdeationPhase(config).run({ idea });
    if (!result.success) {
      terminal.printError(`Phase 1 failed: ${result.error}`);
      process.exit(1);
    }

    terminal.printInfo('Run: orchestrator approve phase-1');
    return;
  }

  // Phase 1 not approved?
  if (!meta.gates.ideation_approved) {
    terminal.printInfo('Phase 1 complete but not approved.');
    terminal.printInfo('Review PROJECT.md, then run: orchestrator approve phase-1');
    return;
  }

  // Phase 2 not complete?
  if (!meta.gates.spec_complete) {
    terminal.printInfo('Running Phase 2: Specification');
    const doc = stateManager.getProject();
    if (!doc.ideation) {
      terminal.printError('Ideation content missing. Cannot proceed.');
      process.exit(1);
    }

    const result = await new SpecPhase(config).run({ ideation: doc.ideation });
    if (!result.success) {
      terminal.printError(`Phase 2 failed: ${result.error}`);
      process.exit(1);
    }

    terminal.printInfo('Run: orchestrator approve phase-2');
    return;
  }

  // Phase 2 not approved?
  if (!meta.gates.spec_approved) {
    terminal.printInfo('Phase 2 complete but not approved.');
    terminal.printInfo('Run: orchestrator approve phase-2');
    return;
  }

  // Phase 3 not complete?
  if (!meta.gates.planning_complete) {
    terminal.printInfo('Running Phase 3: Implementation Planning');
    const doc = stateManager.getProject();
    if (!doc.specification) {
      terminal.printError('Specification content missing. Cannot proceed.');
      process.exit(1);
    }

    const result = await new PlanningPhase(config).run({
      specification: doc.specification,
    });
    if (!result.success) {
      terminal.printError(`Phase 3 failed: ${result.error}`);
      process.exit(1);
    }

    terminal.printInfo('Run: orchestrator approve phase-3');
    return;
  }

  // Phase 3 not approved?
  if (!meta.gates.planning_approved) {
    terminal.printInfo('Phase 3 complete but not approved.');
    terminal.printInfo('Run: orchestrator approve phase-3');
    return;
  }

  // All planning approved - proceed to implementation
  terminal.printInfo('All planning phases approved. Starting implementation...');
  terminal.printInfo('(Implementation execution will be added in Phase F)');
}
