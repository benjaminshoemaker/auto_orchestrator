import { findProjectRoot } from '../utils/project.js';
import { DocumentManager } from '../lib/documents.js';
import { StateManager } from '../lib/state/state-manager.js';
import { PhaseManager } from '../lib/state/phase-manager.js';
import * as terminal from '../lib/ui/terminal.js';

export interface ApproveOptions {
  dir?: string;
  notes?: string;
}

export async function approveCommand(phase: string, options: ApproveOptions): Promise<void> {
  const projectDir = findProjectRoot(options.dir);
  if (!projectDir) {
    terminal.printError('Not in an orchestrator project.');
    process.exit(1);
  }

  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();

  const phaseManager = new PhaseManager(stateManager);

  // Parse phase argument
  const phaseNum = parsePhaseArg(phase);
  if (phaseNum === null) {
    terminal.printError(
      `Invalid phase: ${phase}. Use phase-1, phase-2, phase-3, or impl-N`
    );
    process.exit(1);
  }

  // Check readiness
  const readiness = phaseManager.getReadinessForApproval(phaseNum);
  if (!readiness.ready) {
    terminal.printError(`Phase ${phase} is not ready for approval:`);
    readiness.blockers.forEach((b) => terminal.printWarning(`  - ${b}`));
    process.exit(1);
  }

  // Approve
  stateManager.approvePhase(phase, options.notes);
  await stateManager.save();

  terminal.printSuccess(`Phase ${phase} approved!`);
  terminal.printInfo('Run "orchestrator resume" to continue.');
}

function parsePhaseArg(phase: string): number | string | null {
  if (phase === 'phase-1' || phase === '1') return 1;
  if (phase === 'phase-2' || phase === '2') return 2;
  if (phase === 'phase-3' || phase === '3') return 3;
  const implMatch = phase.match(/^impl-(\d+)$/);
  if (implMatch) return `impl-${implMatch[1]}`;
  return null;
}
