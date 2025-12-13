import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { INITIAL_PROJECT_MD, CLAUDE_MD_TEMPLATE, slugify } from './templates.js';
import { DocumentParseError } from '../types/errors.js';

/**
 * Paths for standard project files
 */
export interface ProjectPaths {
  root: string;
  projectMd: string;
  claudeMd: string;
  tasksDir: string;
  resultsDir: string;
}

/**
 * Marker file that identifies an orchestrator project
 */
const MARKER_FILE = 'PROJECT.md';

/**
 * Find the project root by looking for PROJECT.md
 * Walks up directory tree from startDir until it finds the marker
 */
export function findProjectRoot(startDir?: string): string | null {
  let currentDir = path.resolve(startDir || process.cwd());
  const rootDir = path.parse(currentDir).root;

  while (currentDir !== rootDir) {
    const markerPath = path.join(currentDir, MARKER_FILE);
    try {
      // Check synchronously for simplicity in the find operation
      const stat = fsSync.statSync(markerPath);
      if (stat.isFile()) {
        return currentDir;
      }
    } catch {
      // File doesn't exist, continue up
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Get paths to all standard project files
 */
export function getProjectPaths(projectDir: string): ProjectPaths {
  return {
    root: projectDir,
    projectMd: path.join(projectDir, 'PROJECT.md'),
    claudeMd: path.join(projectDir, 'CLAUDE.md'),
    tasksDir: path.join(projectDir, 'tasks'),
    resultsDir: path.join(projectDir, 'tasks', 'results'),
  };
}

/**
 * Check if a directory is a valid orchestrator project
 */
export async function validateProjectDir(dir: string): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const issues: string[] = [];
  const paths = getProjectPaths(dir);

  // Check if directory exists
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      issues.push('Path is not a directory');
      return { valid: false, issues };
    }
  } catch {
    issues.push('Directory does not exist');
    return { valid: false, issues };
  }

  // Check for PROJECT.md
  try {
    await fs.access(paths.projectMd);
  } catch {
    issues.push('PROJECT.md not found');
  }

  // Check for CLAUDE.md
  try {
    await fs.access(paths.claudeMd);
  } catch {
    issues.push('CLAUDE.md not found');
  }

  // Check for tasks directory
  try {
    await fs.access(paths.tasksDir);
  } catch {
    issues.push('tasks directory not found');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Initialize a new project directory
 * @throws {DocumentParseError} if PROJECT.md already exists
 */
export async function initProjectDir(
  dir: string,
  projectName: string
): Promise<ProjectPaths> {
  const paths = getProjectPaths(dir);

  // Check if PROJECT.md already exists
  try {
    await fs.access(paths.projectMd);
    // If we get here, file exists - throw error
    throw DocumentParseError.alreadyExists(paths.projectMd);
  } catch (error) {
    // If it's our error, re-throw it
    if (error instanceof DocumentParseError) {
      throw error;
    }
    // Otherwise, file doesn't exist - continue
  }

  // Create directories
  await fs.mkdir(paths.tasksDir, { recursive: true });
  await fs.mkdir(paths.resultsDir, { recursive: true });

  // Create PROJECT.md from template
  const slug = slugify(projectName);
  const projectId = `${slug}-${Date.now().toString(36)}`;
  const timestamp = new Date().toISOString();

  const projectMdContent = INITIAL_PROJECT_MD.replace('{{PROJECT_ID}}', projectId)
    .replace('{{PROJECT_NAME}}', projectName)
    .replace(/\{\{TIMESTAMP\}\}/g, timestamp);

  await fs.writeFile(paths.projectMd, projectMdContent, 'utf-8');

  // Create CLAUDE.md from template
  const claudeMdContent = CLAUDE_MD_TEMPLATE.replace('{{PROJECT_NAME}}', projectName);
  await fs.writeFile(paths.claudeMd, claudeMdContent, 'utf-8');

  return paths;
}

/**
 * Check if a PROJECT.md already exists in the directory
 */
export async function projectExists(dir: string): Promise<boolean> {
  const paths = getProjectPaths(dir);
  try {
    await fs.access(paths.projectMd);
    return true;
  } catch {
    return false;
  }
}
