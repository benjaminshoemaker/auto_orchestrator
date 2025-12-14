/**
 * Task Prompt Builder
 * Constructs prompts for Claude CLI task execution
 */

import type { Task, ImplementationPhase, SpecificationContent } from '../../types/index.js';

export interface TaskContext {
  projectName: string;
  phaseName: string;
  phaseNumber: number;
  techStack?: SpecificationContent['tech_stack'];
  architecture?: string;
  previousTasks?: Task[];
  claudeMdPath?: string;
}

/**
 * Build the prompt for a task execution
 */
export function buildTaskPrompt(task: Task, context: TaskContext): string {
  const sections: string[] = [];

  // Project Context
  sections.push(buildProjectContext(context));

  // Task Section
  sections.push(buildTaskSection(task));

  // Dependencies / Previous Tasks
  if (context.previousTasks && context.previousTasks.length > 0) {
    sections.push(buildDependenciesSection(context.previousTasks));
  }

  // Instructions
  sections.push(buildInstructions(context));

  return sections.join('\n\n');
}

/**
 * Build the project context section
 */
function buildProjectContext(context: TaskContext): string {
  let section = `# Project: ${context.projectName}\n`;
  section += `Phase ${context.phaseNumber}: ${context.phaseName}\n`;

  if (context.architecture) {
    section += `\nArchitecture: ${context.architecture}\n`;
  }

  if (context.techStack && context.techStack.length > 0) {
    section += `\nTech Stack:\n`;
    context.techStack.forEach((t) => {
      section += `- ${t.layer}: ${t.choice}`;
      if (t.rationale) {
        section += ` (${t.rationale})`;
      }
      section += '\n';
    });
  }

  return section;
}

/**
 * Build the task section
 */
function buildTaskSection(task: Task): string {
  let section = `## Task ${task.id}\n`;
  section += `${task.description}\n`;

  section += `\n### Acceptance Criteria\n`;
  task.acceptance_criteria.forEach((criterion, i) => {
    section += `${i + 1}. ${criterion}\n`;
  });

  if (task.depends_on && task.depends_on.length > 0) {
    section += `\n### Dependencies\n`;
    section += `This task depends on: ${task.depends_on.join(', ')}\n`;
  }

  return section;
}

/**
 * Build section showing completed dependencies
 */
function buildDependenciesSection(previousTasks: Task[]): string {
  const completedTasks = previousTasks.filter((t) => t.status === 'complete');

  if (completedTasks.length === 0) {
    return '';
  }

  let section = `## Previously Completed Tasks\n`;
  completedTasks.slice(-5).forEach((t) => {
    section += `- ${t.id}: ${t.description}\n`;
  });

  return section;
}

/**
 * Build the instructions section
 */
function buildInstructions(context: TaskContext): string {
  let section = `## Instructions\n`;
  section += `1. Implement the task described above\n`;
  section += `2. Ensure all acceptance criteria are met\n`;
  section += `3. Follow existing code patterns and conventions\n`;
  section += `4. Write clean, well-documented code\n`;

  if (context.claudeMdPath) {
    section += `5. Refer to ${context.claudeMdPath} for project-specific guidelines\n`;
  }

  section += `\n### Output Format\n`;
  section += `When complete, provide a summary in this format:\n`;
  section += `\`\`\`\n`;
  section += `## Task Complete\n`;
  section += `### Files Modified\n`;
  section += `- path/to/file1.ts: description of changes\n`;
  section += `- path/to/file2.ts: description of changes\n`;
  section += `\n`;
  section += `### Tests\n`;
  section += `- Describe any tests added or modified\n`;
  section += `\n`;
  section += `### Acceptance Criteria Status\n`;
  section += `1. [PASS/FAIL] First criterion\n`;
  section += `2. [PASS/FAIL] Second criterion\n`;
  section += `\`\`\`\n`;

  return section;
}

/**
 * Build a validation prompt for checking task completion
 */
export function buildValidationPrompt(
  task: Task,
  executionOutput: string
): string {
  let prompt = `# Task Validation\n\n`;
  prompt += `## Original Task\n`;
  prompt += `${task.description}\n\n`;

  prompt += `## Acceptance Criteria\n`;
  task.acceptance_criteria.forEach((criterion, i) => {
    prompt += `${i + 1}. ${criterion}\n`;
  });

  prompt += `\n## Execution Output\n`;
  prompt += `\`\`\`\n${executionOutput.slice(0, 5000)}\n\`\`\`\n\n`;

  prompt += `## Instructions\n`;
  prompt += `Analyze the execution output and determine:\n`;
  prompt += `1. Was the task completed successfully?\n`;
  prompt += `2. Were all acceptance criteria met?\n\n`;

  prompt += `Respond in this format:\n`;
  prompt += `\`\`\`\n`;
  prompt += `## Validation Result\n`;
  prompt += `Status: [PASS/FAIL]\n\n`;
  prompt += `### Criteria Status\n`;
  prompt += `1. [PASS/FAIL] First criterion - reason\n`;
  prompt += `2. [PASS/FAIL] Second criterion - reason\n\n`;
  prompt += `### Summary\n`;
  prompt += `Brief explanation of the validation result.\n`;
  prompt += `\`\`\`\n`;

  return prompt;
}

/**
 * Build a retry prompt for a failed task
 */
export function buildRetryPrompt(
  task: Task,
  previousOutput: string,
  failureReason: string,
  context: TaskContext
): string {
  const originalPrompt = buildTaskPrompt(task, context);

  let retrySection = `\n## Previous Attempt Failed\n`;
  retrySection += `Reason: ${failureReason}\n\n`;
  retrySection += `### Previous Output (truncated)\n`;
  retrySection += `\`\`\`\n${previousOutput.slice(0, 2000)}\n\`\`\`\n\n`;
  retrySection += `### Retry Instructions\n`;
  retrySection += `Please fix the issues from the previous attempt.\n`;
  retrySection += `Focus on addressing the failure reason.\n`;

  return originalPrompt + '\n\n' + retrySection;
}

/**
 * Build a prompt for a batch of related tasks
 */
export function buildBatchPrompt(
  tasks: Task[],
  context: TaskContext
): string {
  const sections: string[] = [];

  // Project Context
  sections.push(buildProjectContext(context));

  // All tasks
  sections.push(`## Tasks (${tasks.length} total)\n`);
  tasks.forEach((task, i) => {
    sections.push(`### Task ${i + 1}: ${task.id}`);
    sections.push(`${task.description}\n`);
    sections.push(`Acceptance Criteria:`);
    task.acceptance_criteria.forEach((c, j) => {
      sections.push(`${j + 1}. ${c}`);
    });
    sections.push('');
  });

  // Batch instructions
  sections.push(`## Instructions`);
  sections.push(`Complete all ${tasks.length} tasks above.`);
  sections.push(`For each task, ensure all acceptance criteria are met.`);
  sections.push(`Provide a summary for each completed task.`);

  return sections.join('\n');
}
