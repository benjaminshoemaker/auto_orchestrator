import * as fs from 'fs/promises';
import * as path from 'path';
import { Task, ImplementationPhase, TaskResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Context needed to build a task prompt
 */
export interface TaskContext {
  task: Task;
  phase: ImplementationPhase;
  dependencyResults: TaskResult[];
}

/**
 * Default CLAUDE.md template
 */
const CLAUDE_MD_TEMPLATE = `# Project Context

## Project Overview

**Name:** {{PROJECT_NAME}}
**Description:** {{PROJECT_DESCRIPTION}}

## Code Conventions

- Use TypeScript with strict mode
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add JSDoc comments for exported functions
- Keep functions small and focused

## Testing Requirements

- Write tests using Vitest
- Follow TDD: write failing tests first, then implement
- Test edge cases and error conditions
- Aim for high test coverage

## Output Requirements

When completing a task, create a result JSON file in \`tasks/results/\` with:
- Summary of work done
- Files created/modified/deleted
- Key decisions made
- Test results
- Acceptance criteria status

## Project Structure

\`\`\`
[Project structure will be added here]
\`\`\`
`;

/**
 * Task result JSON schema for output
 */
const TASK_RESULT_SCHEMA = `{
  "task_id": "string",
  "task_description": "string",
  "status": "success" | "failed",
  "started_at": "ISO date",
  "completed_at": "ISO date",
  "duration_seconds": number,
  "summary": "Brief description of what was done",
  "files_created": ["path1", "path2"],
  "files_modified": ["path1"],
  "files_deleted": [],
  "key_decisions": [
    { "decision": "string", "rationale": "string" }
  ],
  "assumptions": ["string"],
  "tests_added": number,
  "tests_passing": number,
  "tests_failing": number,
  "test_output": "optional test output",
  "acceptance_criteria": [
    { "criterion": "string", "met": boolean, "notes": "optional" }
  ],
  "validation": {
    "passed": boolean,
    "validator_output": "string",
    "criteria_checked": number,
    "criteria_passed": number
  },
  "tokens_used": number,
  "cost_usd": number,
  "failure_reason": "optional - why it failed",
  "commit_hash": "optional - git commit"
}`;

/**
 * Manager for CLAUDE.md context files
 */
export class ClaudeMdManager {
  private claudeMdPath: string;

  constructor(private projectDir: string) {
    this.claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  }

  /**
   * Check if CLAUDE.md exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.claudeMdPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read CLAUDE.md content
   */
  async read(): Promise<string> {
    return fs.readFile(this.claudeMdPath, 'utf-8');
  }

  /**
   * Initialize CLAUDE.md from template
   */
  async initialize(projectName: string, projectDescription: string): Promise<void> {
    const content = CLAUDE_MD_TEMPLATE
      .replace('{{PROJECT_NAME}}', projectName)
      .replace('{{PROJECT_DESCRIPTION}}', projectDescription);

    await fs.writeFile(this.claudeMdPath, content, 'utf-8');
    logger.debug(`Initialized CLAUDE.md at ${this.claudeMdPath}`);
  }

  /**
   * Update project info section
   */
  async updateProjectInfo(
    name: string,
    description: string,
    techStack?: string
  ): Promise<void> {
    let content = await this.read();

    // Update name
    content = content.replace(
      /\*\*Name:\*\* .*/,
      `**Name:** ${name}`
    );

    // Update description
    content = content.replace(
      /\*\*Description:\*\* .*/,
      `**Description:** ${description}`
    );

    // Add tech stack section if provided
    if (techStack) {
      const techStackSection = `\n## Tech Stack\n\n${techStack}\n`;

      // Insert after Project Overview section
      const overviewEnd = content.indexOf('## Code Conventions');
      if (overviewEnd !== -1) {
        // Check if Tech Stack section already exists
        if (content.includes('## Tech Stack')) {
          // Replace existing tech stack
          content = content.replace(
            /## Tech Stack\n\n[\s\S]*?\n(?=##|$)/,
            techStackSection
          );
        } else {
          // Insert new tech stack section
          content = content.slice(0, overviewEnd) + techStackSection + content.slice(overviewEnd);
        }
      }
    }

    await fs.writeFile(this.claudeMdPath, content, 'utf-8');
    logger.debug('Updated CLAUDE.md project info');
  }

  /**
   * Build complete task context prompt for execution
   */
  async buildTaskContext(context: TaskContext): Promise<string> {
    const { task, phase, dependencyResults } = context;

    // Read base CLAUDE.md content
    const baseContent = await this.read();

    const sections: string[] = [baseContent, '\n---\n'];

    // Current Task section
    sections.push('## Current Task\n');
    sections.push(`**Task ID:** ${task.id}`);
    sections.push(`**Phase:** ${phase.name}`);
    sections.push(`**Description:** ${task.description}\n`);

    // Acceptance Criteria section
    if (task.acceptance_criteria.length > 0) {
      sections.push('### Acceptance Criteria\n');
      sections.push('You must satisfy ALL of the following:\n');
      for (const criterion of task.acceptance_criteria) {
        sections.push(`- [ ] ${criterion}`);
      }
      sections.push('');
    }

    // Dependencies section
    if (dependencyResults.length > 0) {
      sections.push('### Completed Dependencies\n');
      sections.push('The following tasks have been completed. Use their outputs as needed:\n');

      for (const dep of dependencyResults) {
        sections.push(`#### Task ${dep.task_id}: ${dep.task_description}\n`);
        sections.push(`**Summary:** ${dep.summary}\n`);

        if (dep.files_created.length > 0) {
          sections.push(`**Files created:** ${dep.files_created.join(', ')}\n`);
        }

        if (dep.files_modified.length > 0) {
          sections.push(`**Files modified:** ${dep.files_modified.join(', ')}\n`);
        }

        if (dep.key_decisions.length > 0) {
          sections.push('**Key decisions:**');
          for (const decision of dep.key_decisions) {
            sections.push(`- ${decision.decision}: ${decision.rationale}`);
          }
          sections.push('');
        }
      }
    }

    // Instructions section
    sections.push('---\n');
    sections.push('### Instructions\n');
    sections.push('1. Read relevant codebase files to understand context');
    sections.push('2. Write failing tests first (TDD)');
    sections.push('3. Implement code to make tests pass');
    sections.push('4. Run all tests: npm test');
    sections.push(`5. Write results JSON to: tasks/results/task-${task.id}.json\n`);

    // Output Format section
    sections.push('### Output Format\n');
    sections.push(`Create \`tasks/results/task-${task.id}.json\` with this structure:\n`);
    sections.push('```json');
    sections.push(TASK_RESULT_SCHEMA);
    sections.push('```\n');
    sections.push('**IMPORTANT:** Set status to "success" only if ALL acceptance criteria are met and all tests pass.');

    return sections.join('\n');
  }
}
