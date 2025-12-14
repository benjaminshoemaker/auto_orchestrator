import * as fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import { findProjectRoot, getProjectPaths } from '../utils/project.js';
import { GitClient } from '../lib/git/git-client.js';

export interface StatusOptions {
  dir?: string;
  json?: boolean;
}

interface BasicStatus {
  projectName: string;
  projectDir: string;
  hasProjectMd: boolean;
  hasClaudeMd: boolean;
  hasTasksDir: boolean;
  git?: {
    isRepo: boolean;
    branch: string | null;
    hasChanges: boolean;
  };
}

async function getBasicStatus(projectDir: string): Promise<BasicStatus> {
  const paths = getProjectPaths(projectDir);

  let projectName = 'Unknown';
  let hasProjectMd = false;
  let hasClaudeMd = false;
  let hasTasksDir = false;

  // Check PROJECT.md
  try {
    const content = await fs.readFile(paths.projectMd, 'utf-8');
    hasProjectMd = true;

    // Try to extract project name from YAML frontmatter
    const match = content.match(/project_name:\s*"([^"]+)"/);
    if (match?.[1]) {
      projectName = match[1];
    }
  } catch {
    // File doesn't exist
  }

  // Check CLAUDE.md
  try {
    await fs.access(paths.claudeMd);
    hasClaudeMd = true;
  } catch {
    // File doesn't exist
  }

  // Check tasks directory
  try {
    const stat = await fs.stat(paths.tasksDir);
    hasTasksDir = stat.isDirectory();
  } catch {
    // Directory doesn't exist
  }

  // Check Git status
  let git: BasicStatus['git'];
  try {
    const gitClient = new GitClient(projectDir);
    const isRepo = await gitClient.isRepo();
    if (isRepo) {
      const branch = await gitClient.getCurrentBranch();
      const hasChanges = await gitClient.hasUncommittedChanges();
      git = { isRepo, branch, hasChanges };
    }
  } catch {
    // Git not available or error
  }

  return {
    projectName,
    projectDir,
    hasProjectMd,
    hasClaudeMd,
    hasTasksDir,
    git,
  };
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  // Find project root
  const projectDir = findProjectRoot(options.dir);

  if (!projectDir) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Not in an orchestrator project' }, null, 2));
    } else {
      logger.error('Not in an orchestrator project.');
      logger.info('Run "orchestrator init <idea>" to create a new project.');
    }
    process.exit(1);
  }

  const status = await getBasicStatus(projectDir);

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  // Pretty print status
  logger.info('');
  logger.log(`Project: ${status.projectName}`);
  logger.log(`Directory: ${status.projectDir}`);
  logger.info('');
  logger.log('Files:');
  logger.log(`  PROJECT.md: ${status.hasProjectMd ? '✓' : '✗'}`);
  logger.log(`  CLAUDE.md: ${status.hasClaudeMd ? '✓' : '✗'}`);
  logger.log(`  tasks/: ${status.hasTasksDir ? '✓' : '✗'}`);
  logger.info('');

  // Show Git status
  if (status.git?.isRepo) {
    logger.log('Git:');
    logger.log(`  Branch: ${status.git.branch || 'unknown'}`);
    logger.log(`  Status: ${status.git.hasChanges ? 'uncommitted changes' : 'clean'}`);
    logger.info('');
  }

  // Note: Full status with phase info will be added when we have the parser
  logger.info('Note: Run "orchestrator resume" to continue the project.');
}
