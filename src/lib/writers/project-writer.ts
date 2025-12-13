import { serializeFrontmatter, updateFrontmatter } from '../parsers/frontmatter.js';
import { parseProjectMd } from '../parsers/project-parser.js';
import {
  ProjectDocument,
  ProjectMeta,
  IdeationContent,
  SpecificationContent,
  ImplementationPhase,
  Task,
  Approval,
} from '../../types/index.js';

/**
 * Write a complete ProjectDocument to markdown format
 */
export function writeProjectMd(doc: ProjectDocument): string {
  const content = buildMarkdownContent(doc);
  return serializeFrontmatter(doc.meta as unknown as Record<string, unknown>, content);
}

/**
 * Update only the meta (frontmatter) of a PROJECT.md
 */
export function updateProjectMeta(
  original: string,
  updates: Partial<ProjectMeta>
): string {
  return updateFrontmatter(original, updates as Record<string, unknown>);
}

/**
 * Update a specific task in a PROJECT.md
 */
export function updateProjectTask(
  original: string,
  taskId: string,
  updates: Partial<Task>
): string {
  const doc = parseProjectMd(original);

  // Find and update the task
  for (const phase of doc.implementation_phases) {
    const task = phase.tasks.find((t) => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      break;
    }
  }

  return writeProjectMd(doc);
}

/**
 * Update approval status for a phase
 */
export function updateProjectApproval(
  original: string,
  phase: string,
  status: 'pending' | 'approved',
  notes?: string
): string {
  const doc = parseProjectMd(original);

  const approval = doc.approvals.find((a) => a.phase === phase);
  if (approval) {
    approval.status = status;
    if (status === 'approved') {
      approval.approved_at = new Date().toISOString();
    }
    if (notes) {
      approval.notes = notes;
    }
  } else {
    // Add new approval entry
    doc.approvals.push({
      phase,
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : undefined,
      notes,
    });
  }

  return writeProjectMd(doc);
}

/**
 * Add an implementation phase to a PROJECT.md
 */
export function addImplementationPhase(
  original: string,
  phase: ImplementationPhase
): string {
  const doc = parseProjectMd(original);
  doc.implementation_phases.push(phase);
  return writeProjectMd(doc);
}

/**
 * Build markdown content from ProjectDocument (without frontmatter)
 */
function buildMarkdownContent(doc: ProjectDocument): string {
  const sections: string[] = [];

  // Title
  sections.push(`# ${doc.meta.project_name}\n`);

  // Phase 1: Ideation
  sections.push(buildIdeationSection(doc.ideation, doc.meta.gates.ideation_complete));

  // Phase 2: Specification
  sections.push(buildSpecificationSection(doc.specification, doc.meta.gates.spec_complete));

  // Phase 3: Planning
  sections.push(buildPlanningSection(doc.meta.gates.planning_complete));

  // Implementation Phases
  sections.push(buildImplementationPhasesSection(doc.implementation_phases));

  // Approvals
  sections.push(buildApprovalsSection(doc.approvals));

  return sections.join('\n');
}

/**
 * Build Phase 1: Ideation section
 */
function buildIdeationSection(ideation: IdeationContent | null, complete: boolean): string {
  const lines: string[] = [];
  lines.push('## Phase 1: Idea Refinement\n');

  if (!ideation) {
    lines.push(`*Status: ${complete ? 'Complete' : 'Pending'}*\n`);
    if (!complete) {
      lines.push('> Awaiting user input to begin ideation phase.\n');
    }
    lines.push('---\n');
    return lines.join('\n');
  }

  lines.push('*Status: Complete*\n');

  if (ideation.problem_statement) {
    lines.push('### Problem Statement\n');
    lines.push(ideation.problem_statement + '\n');
  }

  if (ideation.target_users) {
    lines.push('### Target Users\n');
    lines.push(ideation.target_users + '\n');
  }

  if (ideation.use_cases.length > 0) {
    lines.push('### Use Cases\n');
    for (const uc of ideation.use_cases) {
      lines.push(`- ${uc}`);
    }
    lines.push('');
  }

  if (ideation.success_criteria.length > 0) {
    lines.push('### Success Criteria\n');
    for (const sc of ideation.success_criteria) {
      lines.push(`- ${sc}`);
    }
    lines.push('');
  }

  if (ideation.constraints.must_have.length > 0 ||
      ideation.constraints.nice_to_have.length > 0 ||
      ideation.constraints.out_of_scope.length > 0) {
    lines.push('### Constraints\n');
    if (ideation.constraints.must_have.length > 0) {
      lines.push('**Must Have:**');
      for (const item of ideation.constraints.must_have) {
        lines.push(`- ${item}`);
      }
    }
    if (ideation.constraints.nice_to_have.length > 0) {
      lines.push('\n**Nice to Have:**');
      for (const item of ideation.constraints.nice_to_have) {
        lines.push(`- ${item}`);
      }
    }
    if (ideation.constraints.out_of_scope.length > 0) {
      lines.push('\n**Out of Scope:**');
      for (const item of ideation.constraints.out_of_scope) {
        lines.push(`- ${item}`);
      }
    }
    lines.push('');
  }

  lines.push('---\n');
  return lines.join('\n');
}

/**
 * Build Phase 2: Specification section
 */
function buildSpecificationSection(spec: SpecificationContent | null, complete: boolean): string {
  const lines: string[] = [];
  lines.push('## Phase 2: Specification\n');

  if (!spec) {
    lines.push(`*Status: ${complete ? 'Complete' : 'Not Started'}*\n`);
    lines.push('---\n');
    return lines.join('\n');
  }

  lines.push('*Status: Complete*\n');

  if (spec.architecture) {
    lines.push('### Architecture\n');
    lines.push(spec.architecture + '\n');
  }

  if (spec.tech_stack.length > 0) {
    lines.push('### Tech Stack\n');
    lines.push('| Layer | Choice | Rationale |');
    lines.push('|-------|--------|-----------|');
    for (const item of spec.tech_stack) {
      lines.push(`| ${item.layer} | ${item.choice} | ${item.rationale} |`);
    }
    lines.push('');
  }

  if (spec.data_models) {
    lines.push('### Data Models\n');
    lines.push(spec.data_models + '\n');
  }

  if (spec.api_contracts) {
    lines.push('### API Contracts\n');
    lines.push(spec.api_contracts + '\n');
  }

  if (spec.ui_requirements) {
    lines.push('### UI Requirements\n');
    lines.push(spec.ui_requirements + '\n');
  }

  lines.push('---\n');
  return lines.join('\n');
}

/**
 * Build Phase 3: Planning section
 */
function buildPlanningSection(complete: boolean): string {
  const lines: string[] = [];
  lines.push('## Phase 3: Implementation Planning\n');
  lines.push(`*Status: ${complete ? 'Complete' : 'Not Started'}*\n`);
  lines.push('---\n');
  return lines.join('\n');
}

/**
 * Build Implementation Phases section
 */
function buildImplementationPhasesSection(phases: ImplementationPhase[]): string {
  const lines: string[] = [];
  lines.push('## Implementation Phases\n');

  if (phases.length === 0) {
    lines.push('*No implementation phases defined yet.*\n');
    lines.push('---\n');
    return lines.join('\n');
  }

  for (const phase of phases) {
    lines.push(`### Phase ${phase.phase_number}: ${phase.name}\n`);

    if (phase.description) {
      lines.push(phase.description + '\n');
    }

    if (phase.tasks.length > 0) {
      lines.push('| ID | Description | Status | Depends On | Acceptance Criteria |');
      lines.push('|----|-------------|--------|------------|---------------------|');
      for (const task of phase.tasks) {
        const deps = task.depends_on.length > 0 ? task.depends_on.join(', ') : '-';
        const statusDisplay = formatTaskStatus(task.status);
        const criteria = task.acceptance_criteria.length > 0 ? task.acceptance_criteria.join('; ') : '-';
        lines.push(`| ${task.id} | ${task.description} | ${statusDisplay} | ${deps} | ${criteria} |`);
      }
      lines.push('');
    }
  }

  lines.push('---\n');
  return lines.join('\n');
}

/**
 * Format task status for display
 * Status markers: ⏳ pending, 🔄 in_progress, ✅ complete, ❌ failed, ⏭️ skipped
 */
function formatTaskStatus(status: Task['status']): string {
  switch (status) {
    case 'complete':
      return '✅ complete';
    case 'in_progress':
      return '🔄 in progress';
    case 'failed':
      return '❌ failed';
    case 'skipped':
      return '⏭️ skipped';
    default:
      return '⏳ pending';
  }
}

/**
 * Build Approvals section
 */
function buildApprovalsSection(approvals: Approval[]): string {
  const lines: string[] = [];
  lines.push('## Approvals\n');
  lines.push('| Phase | Status | Approved At | Notes |');
  lines.push('|-------|--------|-------------|-------|');

  // Ensure we have Phase 1, 2, 3 entries
  const phases = ['Phase 1', 'Phase 2', 'Phase 3'];
  for (const phase of phases) {
    const approval = approvals.find((a) => a.phase === phase);
    if (approval) {
      const at = approval.approved_at || '-';
      const notes = approval.notes || '-';
      lines.push(`| ${approval.phase} | ${approval.status} | ${at} | ${notes} |`);
    } else {
      lines.push(`| ${phase} | pending | - | - |`);
    }
  }

  // Add any impl-N approvals
  for (const approval of approvals) {
    if (approval.phase.startsWith('impl-')) {
      const at = approval.approved_at || '-';
      const notes = approval.notes || '-';
      lines.push(`| ${approval.phase} | ${approval.status} | ${at} | ${notes} |`);
    }
  }

  return lines.join('\n');
}
