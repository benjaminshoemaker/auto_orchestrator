/**
 * Prompts and parsers for Phase 3: Implementation Planning
 */

import {
  IdeationContent,
  SpecificationContent,
  ImplementationPhase,
  Task,
} from '../../../types/index.js';
import {
  buildSystemPrompt,
  buildPrompt,
  extractTagContent,
  parseBulletList,
  PromptSection,
} from './base.js';

/**
 * System prompt for planning phase
 */
export const PLANNING_SYSTEM_PROMPT = buildSystemPrompt(
  'an expert project manager and software architect creating an implementation plan',
  [
    'You are in Phase 3: Implementation Planning.',
    '',
    'Given the specification, create a detailed implementation plan:',
    '1. Break into implementation phases (2-5 phases, each a testable milestone)',
    '2. Within each phase, define small tasks',
    '3. Each task should be 15-30 minutes of work for an AI coding agent',
    '4. Define clear dependencies between tasks',
    '5. Write specific acceptance criteria for each task',
    '',
    'Task guidelines:',
    '- Tasks should produce testable output',
    '- Prefer many small tasks over few large ones',
    '- Earlier tasks should set up foundations',
    '- Later tasks build on earlier work',
    '',
    'End your final implementation plan with:',
    '---',
    'PHASE_3_COMPLETE',
    '---',
  ]
);

/**
 * Build initial planning prompt
 */
export function buildPlanningStartPrompt(
  projectName: string,
  ideation: IdeationContent,
  specification: SpecificationContent
): string {
  const sections: PromptSection[] = [
    {
      title: 'Project',
      content: projectName,
    },
    {
      title: 'Problem',
      content: ideation.problem_statement,
    },
    {
      title: 'Use Cases',
      content: ideation.use_cases.map((uc, i) => `${i + 1}. ${uc}`).join('\n'),
    },
    {
      title: 'Architecture',
      content: specification.architecture,
    },
    {
      title: 'Tech Stack',
      content: specification.tech_stack.map((item) => `- ${item.layer}: ${item.choice}`).join('\n'),
    },
    {
      title: 'Data Models',
      content: specification.data_models,
    },
    {
      title: 'Your Task',
      content: `Create an implementation plan broken into phases.

Start by proposing a high-level phase breakdown. Consider:
1. What are the logical groupings of work?
2. What needs to be built first (foundations, infrastructure)?
3. What are the key milestones?

Format your response using:
<proposed_phases>
Phase 1: Name - Brief description
Phase 2: Name - Brief description
...
</proposed_phases>
<rationale>Why this breakdown makes sense</rationale>
<questions>Any clarifying questions about priorities or constraints</questions>`,
    },
  ];

  return buildPrompt(sections);
}

/**
 * Follow-up prompt during planning
 */
export function buildPlanningFollowUpPrompt(
  userInput: string,
  phases?: ImplementationPhase[]
): string {
  const sections: PromptSection[] = [];

  if (phases && phases.length > 0) {
    const phaseSummary = phases
      .map((p) => `Phase ${p.phase_number}: ${p.name} (${p.tasks.length} tasks)`)
      .join('\n');
    sections.push({
      title: 'Current Phases',
      content: phaseSummary,
    });
  }

  sections.push({
    title: 'User Input',
    content: userInput,
  });

  sections.push({
    title: 'Instructions',
    content: `Continue developing the implementation plan based on this input.

If defining tasks for a phase, use this format:
<phase name="PhaseName" number="N">
<description>Phase description</description>
<task id="N.1">
<description>Task description</description>
<acceptance_criteria>
- Criterion 1
- Criterion 2
</acceptance_criteria>
<depends_on></depends_on>
</task>
<task id="N.2">
<description>Task description</description>
<acceptance_criteria>
- Criterion 1
</acceptance_criteria>
<depends_on>N.1</depends_on>
</task>
</phase>`,
  });

  return buildPrompt(sections);
}

/**
 * Final planning summary prompt
 */
export function buildPlanningSummaryPrompt(
  conversationSummary: string,
  specification: SpecificationContent
): string {
  const sections: PromptSection[] = [
    {
      title: 'Specification Summary',
      content: `Architecture: ${specification.architecture.slice(0, 500)}...`,
    },
    {
      title: 'Discussion Summary',
      content: conversationSummary,
    },
    {
      title: 'Task',
      content: `Provide the complete implementation plan.

Use this exact format for each phase:

<phase name="Phase Name" number="1">
<description>What this phase accomplishes</description>

<task id="1.1">
<description>Detailed task description</description>
<acceptance_criteria>
- Specific, testable criterion 1
- Specific, testable criterion 2
</acceptance_criteria>
<depends_on></depends_on>
</task>

<task id="1.2">
<description>Detailed task description</description>
<acceptance_criteria>
- Specific criterion
</acceptance_criteria>
<depends_on>1.1</depends_on>
</task>
</phase>

<phase name="Phase Name" number="2">
...
</phase>

Requirements:
- At least 2 phases
- Each phase should have at least 2 tasks
- All tasks need acceptance criteria
- Use task IDs in format N.M (phase.task)
- Specify dependencies using depends_on tags`,
    },
  ];

  return buildPrompt(sections);
}

/**
 * Parse implementation phases from LLM response
 */
export function parsePlanningResponse(response: string): ImplementationPhase[] {
  const phases: ImplementationPhase[] = [];

  // Extract all phase blocks
  const phaseRegex =
    /<phase\s+name="([^"]+)"\s+number="(\d+)">([\s\S]*?)<\/phase>/gi;
  let phaseMatch;

  while ((phaseMatch = phaseRegex.exec(response)) !== null) {
    const phaseName = phaseMatch[1] || '';
    const phaseNumber = parseInt(phaseMatch[2] || '0', 10);
    const phaseContent = phaseMatch[3] || '';

    const description = extractTagContent(phaseContent, 'description') || '';
    const tasks = parseTasksFromPhase(phaseContent, phaseNumber);

    phases.push({
      phase_number: phaseNumber,
      name: phaseName,
      description,
      status: 'pending',
      tasks,
    });
  }

  // Sort by phase number
  phases.sort((a, b) => a.phase_number - b.phase_number);

  return phases;
}

/**
 * Parse tasks from a phase block
 */
function parseTasksFromPhase(phaseContent: string, phaseNumber: number): Task[] {
  const tasks: Task[] = [];

  // Extract all task blocks
  const taskRegex = /<task\s+id="([^"]+)">([\s\S]*?)<\/task>/gi;
  let taskMatch;

  while ((taskMatch = taskRegex.exec(phaseContent)) !== null) {
    const taskId = taskMatch[1] || `${phaseNumber}.${tasks.length + 1}`;
    const taskContent = taskMatch[2] || '';

    const description = extractTagContent(taskContent, 'description') || '';
    const criteriaContent = extractTagContent(taskContent, 'acceptance_criteria');
    const dependsOnContent = extractTagContent(taskContent, 'depends_on');

    const acceptanceCriteria = criteriaContent ? parseBulletList(criteriaContent) : [];
    const dependsOn = dependsOnContent
      ? dependsOnContent
          .split(/[,\s]+/)
          .map((d) => d.trim())
          .filter(Boolean)
      : [];

    tasks.push({
      id: taskId,
      description,
      status: 'pending',
      acceptance_criteria: acceptanceCriteria,
      depends_on: dependsOn,
    });
  }

  return tasks;
}

/**
 * Parse proposed phases (before detailed tasks)
 */
export function parseProposedPhases(
  response: string
): Array<{ name: string; description: string }> {
  const proposedContent = extractTagContent(response, 'proposed_phases');
  if (!proposedContent) {
    return [];
  }

  const phases: Array<{ name: string; description: string }> = [];
  const lines = proposedContent.split('\n');

  for (const line of lines) {
    const match = line.match(/Phase\s+\d+:\s*([^-]+)\s*-\s*(.+)/i);
    if (match?.[1] && match?.[2]) {
      phases.push({
        name: match[1].trim(),
        description: match[2].trim(),
      });
    }
  }

  return phases;
}

/**
 * Check if planning is complete
 */
export function isPlanningComplete(phases: ImplementationPhase[]): boolean {
  if (phases.length < 1) {
    return false;
  }

  for (const phase of phases) {
    if (phase.tasks.length === 0) {
      return false;
    }

    for (const task of phase.tasks) {
      if (task.acceptance_criteria.length === 0) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get planning issues
 */
export function getPlanningIssues(phases: ImplementationPhase[]): string[] {
  const issues: string[] = [];

  if (phases.length === 0) {
    issues.push('No phases defined');
    return issues;
  }

  for (const phase of phases) {
    if (phase.tasks.length === 0) {
      issues.push(`Phase ${phase.phase_number} (${phase.name}) has no tasks`);
    }

    for (const task of phase.tasks) {
      if (task.acceptance_criteria.length === 0) {
        issues.push(`Task ${task.id} has no acceptance criteria`);
      }
    }
  }

  // Check for dependency issues
  const allTaskIds = new Set(phases.flatMap((p) => p.tasks.map((t) => t.id)));
  for (const phase of phases) {
    for (const task of phase.tasks) {
      for (const depId of task.depends_on) {
        if (!allTaskIds.has(depId)) {
          issues.push(`Task ${task.id} depends on non-existent task ${depId}`);
        }
      }
    }
  }

  return issues;
}
