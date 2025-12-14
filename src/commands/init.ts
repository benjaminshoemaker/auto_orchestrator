import * as path from 'path';
import { logger } from '../utils/logger.js';
import { initProjectDir, projectExists } from '../utils/project.js';
import { slugify } from '../utils/templates.js';
import { DocumentManager } from '../lib/documents.js';
import { StateManager } from '../lib/state/state-manager.js';
import { LLMService } from '../lib/llm/llm-service.js';
import { IdeationPhase } from '../lib/phases/ideation-phase.js';
import * as terminal from '../lib/ui/terminal.js';

export interface InitOptions {
  dir?: string;
  name?: string;
}

export async function initCommand(idea: string, options: InitOptions): Promise<void> {
  const projectName = options.name || idea;
  // If no --dir specified, create a subdirectory with slugified name
  const projectDir = options.dir
    ? path.resolve(options.dir)
    : path.resolve(process.cwd(), slugify(projectName));

  logger.info(`Initializing project: ${projectName}`);
  logger.verbose(`Directory: ${projectDir}`);

  // Check if project already exists
  if (await projectExists(projectDir)) {
    terminal.printError('A project already exists in this directory.');
    terminal.printInfo('Use "orchestrator resume" to continue an existing project.');
    process.exit(1);
  }

  try {
    // Create project structure
    const paths = await initProjectDir(projectDir, projectName);

    terminal.printSuccess('Project initialized successfully!');
    terminal.printInfo('');
    terminal.printInfo('Created files:');
    terminal.printInfo(`  ${paths.projectMd}`);
    terminal.printInfo(`  ${paths.claudeMd}`);
    terminal.printInfo(`  ${paths.tasksDir}/`);
    terminal.printInfo('');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    terminal.printError(`Failed to initialize project: ${message}`);
    process.exit(1);
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    terminal.printWarning('ANTHROPIC_API_KEY environment variable not set');
    terminal.printInfo('Set it with: export ANTHROPIC_API_KEY=your-key');
    terminal.printInfo('Or add it to .env.local file');
    terminal.printInfo('');
    terminal.printInfo('Then run "orchestrator resume" to start Phase 1.');
    return;
  }

  // Set up services
  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();

  const llmService = new LLMService({});

  // Run Phase 1
  const ideationPhase = new IdeationPhase({
    llmService,
    stateManager,
    documentManager,
  });

  const result = await ideationPhase.run({ idea, projectName: slugify(projectName) });

  if (!result.success) {
    terminal.printError('Phase 1 failed. Project created but incomplete.');
    terminal.printInfo('Run "orchestrator resume" to try again.');
    process.exit(1);
  }

  terminal.printInfo(`Cost so far: ${terminal.formatCost(result.cost)}`);
  terminal.printInfo('');
  terminal.printInfo('Next: Review PROJECT.md, then run:');
  terminal.printInfo('  orchestrator approve phase-1');
}
