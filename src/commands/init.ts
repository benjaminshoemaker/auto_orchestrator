import * as path from 'path';
import { logger } from '../utils/logger.js';
import { initProjectDir, projectExists } from '../utils/project.js';

export interface InitOptions {
  dir?: string;
  name?: string;
}

export async function initCommand(idea: string, options: InitOptions): Promise<void> {
  const projectDir = path.resolve(options.dir || process.cwd());
  const projectName = options.name || idea;

  logger.info(`Initializing project: ${projectName}`);
  logger.verbose(`Directory: ${projectDir}`);

  // Check if project already exists
  if (await projectExists(projectDir)) {
    logger.error('A project already exists in this directory.');
    logger.info('Use "orchestrator resume" to continue an existing project.');
    process.exit(1);
  }

  try {
    // Create project structure
    const paths = await initProjectDir(projectDir, projectName);

    logger.success('Project initialized successfully!');
    logger.info('');
    logger.info('Created files:');
    logger.info(`  ${paths.projectMd}`);
    logger.info(`  ${paths.claudeMd}`);
    logger.info(`  ${paths.tasksDir}/`);
    logger.info('');
    logger.info('Next steps:');
    logger.info('  1. Review PROJECT.md');
    logger.info('  2. Run "orchestrator resume" to start Phase 1');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to initialize project: ${message}`);
    process.exit(1);
  }
}
