import { parseFrontmatter } from './frontmatter.js';
import {
  ProjectDocument,
  ProjectMeta,
  IdeationContent,
  SpecificationContent,
  ImplementationPhase,
  Task,
  TaskStatus,
  Approval,
} from '../../types/index.js';
import { DocumentParseError } from '../../types/errors.js';

/**
 * Parse a PROJECT.md file into a ProjectDocument
 */
export function parseProjectMd(content: string): ProjectDocument {
  const { data: meta, content: markdown } = parseFrontmatter<ProjectMeta>(content);

  // Validate required meta fields
  validateMeta(meta);

  // Parse markdown sections
  const sections = parseSections(markdown);

  // Extract content from sections
  const ideation = parseIdeationSection(sections['Phase 1: Idea Refinement'] || '');
  const specification = parseSpecificationSection(sections['Phase 2: Specification'] || '');
  const implementationPhases = parseImplementationPhases(
    sections['Implementation Phases'] || ''
  );
  const approvals = parseApprovalsTable(sections['Approvals'] || '');

  return {
    meta,
    ideation,
    specification,
    implementation_phases: implementationPhases,
    approvals,
  };
}

/**
 * Validate that meta has required fields
 */
function validateMeta(meta: unknown): asserts meta is ProjectMeta {
  if (!meta || typeof meta !== 'object') {
    throw DocumentParseError.invalidStructure('Meta must be an object');
  }

  const m = meta as Record<string, unknown>;

  if (typeof m.version !== 'number') {
    throw DocumentParseError.missingField('version');
  }
  if (typeof m.project_id !== 'string') {
    throw DocumentParseError.missingField('project_id');
  }
  if (typeof m.project_name !== 'string') {
    throw DocumentParseError.missingField('project_name');
  }
  if (typeof m.current_phase !== 'number' && m.current_phase !== 'implementation') {
    throw DocumentParseError.missingField('current_phase');
  }
}

/**
 * Parse markdown into sections by ## headers
 */
export function parseSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = markdown.split('\n');

  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // Save previous section
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      // Start new section
      currentSection = line.substring(3).trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Parse ideation section content
 */
function parseIdeationSection(content: string): IdeationContent | null {
  if (!content || content.includes('Not Started') || content.includes('Pending')) {
    return null;
  }

  // Try to extract structured content from ### subsections
  const subSections = parseSubSections(content);

  return {
    problem_statement: subSections['Problem Statement'] || extractFirstParagraph(content),
    target_users: subSections['Target Users'] || '',
    use_cases: parseListItems(subSections['Use Cases'] || ''),
    success_criteria: parseListItems(subSections['Success Criteria'] || ''),
    constraints: {
      must_have: parseListItems(subSections['Must Have'] || subSections['Constraints'] || ''),
      nice_to_have: parseListItems(subSections['Nice to Have'] || ''),
      out_of_scope: parseListItems(subSections['Out of Scope'] || ''),
    },
    raw_content: content,
  };
}

/**
 * Parse specification section content
 */
function parseSpecificationSection(content: string): SpecificationContent | null {
  if (!content || content.includes('Not Started')) {
    return null;
  }

  const subSections = parseSubSections(content);

  return {
    architecture: subSections['Architecture'] || extractFirstParagraph(content),
    tech_stack: parseTechStackTable(subSections['Tech Stack'] || content),
    data_models: subSections['Data Models'] || '',
    api_contracts: subSections['API Contracts'] || subSections['API'] || '',
    ui_requirements: subSections['UI Requirements'] || subSections['UI'] || '',
    raw_content: content,
  };
}

/**
 * Parse implementation phases section
 */
function parseImplementationPhases(content: string): ImplementationPhase[] {
  if (!content || content.includes('No implementation phases')) {
    return [];
  }

  const phases: ImplementationPhase[] = [];
  const phaseRegex = /### Phase (\d+): (.+?)(?=### Phase \d+:|$)/gs;
  let match;

  while ((match = phaseRegex.exec(content)) !== null) {
    const phaseNumber = parseInt(match[1] || '0', 10);
    const headerAndContent = match[2] || '';
    const [name, ...rest] = headerAndContent.split('\n');
    const phaseContent = rest.join('\n');

    const tasks = parseTaskTable(phaseContent);
    const status = determinePhaseStatus(tasks);

    phases.push({
      phase_number: phaseNumber,
      name: name?.trim() || `Phase ${phaseNumber}`,
      description: extractFirstParagraph(phaseContent),
      status,
      tasks,
    });
  }

  return phases;
}

/**
 * Parse a task table from markdown
 */
export function parseTaskTable(content: string): Task[] {
  const tasks: Task[] = [];
  const tableRegex = /\|(.+)\|/g;
  const rows: string[][] = [];

  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const row = match[1]?.split('|').map((cell) => cell.trim()) || [];
    rows.push(row);
  }

  // Skip header and separator rows
  const dataRows = rows.filter(
    (row) =>
      row.length >= 4 &&
      !row[0]?.includes('ID') &&
      !row[0]?.match(/^[-:]+$/)
  );

  for (const row of dataRows) {
    const [id, description, status, depends] = row;
    if (!id || !description) continue;

    const task: Task = {
      id: id.trim(),
      description: description.trim(),
      status: parseTaskStatus(status || 'pending'),
      depends_on: parseDependencies(depends || ''),
      acceptance_criteria: [],
    };

    tasks.push(task);
  }

  return tasks;
}

/**
 * Parse task status from string
 */
function parseTaskStatus(status: string): TaskStatus {
  const normalized = status.toLowerCase().trim();
  if (normalized.includes('complete') || normalized.includes('✓')) return 'complete';
  if (normalized.includes('progress') || normalized.includes('🔄')) return 'in_progress';
  if (normalized.includes('failed') || normalized.includes('✗')) return 'failed';
  if (normalized.includes('skip')) return 'skipped';
  return 'pending';
}

/**
 * Parse dependencies from comma-separated string
 */
function parseDependencies(deps: string): string[] {
  if (!deps || deps === '-' || deps === 'none') return [];
  return deps.split(',').map((d) => d.trim()).filter(Boolean);
}

/**
 * Parse approvals table
 */
function parseApprovalsTable(content: string): Approval[] {
  const approvals: Approval[] = [];
  const tableRegex = /\|(.+)\|/g;
  const rows: string[][] = [];

  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const row = match[1]?.split('|').map((cell) => cell.trim()) || [];
    rows.push(row);
  }

  // Skip header row (contains "Phase" and "Status") and separator
  const dataRows = rows.filter(
    (row) =>
      row.length >= 2 &&
      row[0] !== 'Phase' && // Header row has just "Phase", data rows have "Phase 1" etc.
      !row[0]?.match(/^[-:]+$/) &&
      !row[1]?.match(/^[-:]+$/)
  );

  for (const row of dataRows) {
    const [phase, status, approvedAt, notes] = row;
    if (!phase) continue;

    approvals.push({
      phase: phase.trim(),
      status: status?.toLowerCase().includes('approved') ? 'approved' : 'pending',
      approved_at: approvedAt && approvedAt !== '-' ? approvedAt : undefined,
      notes: notes && notes !== '-' ? notes : undefined,
    });
  }

  return approvals;
}

/**
 * Parse tech stack table
 */
function parseTechStackTable(
  content: string
): { layer: string; choice: string; rationale: string }[] {
  const items: { layer: string; choice: string; rationale: string }[] = [];
  const tableRegex = /\|(.+)\|/g;
  const rows: string[][] = [];

  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const row = match[1]?.split('|').map((cell) => cell.trim()) || [];
    rows.push(row);
  }

  // Skip header and separator
  const dataRows = rows.filter(
    (row) =>
      row.length >= 2 &&
      !row[0]?.includes('Layer') &&
      !row[0]?.match(/^[-:]+$/)
  );

  for (const row of dataRows) {
    const [layer, choice, rationale] = row;
    if (!layer || !choice) continue;

    items.push({
      layer: layer.trim(),
      choice: choice.trim(),
      rationale: rationale?.trim() || '',
    });
  }

  return items;
}

/**
 * Parse ### subsections
 */
function parseSubSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');

  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = line.substring(4).trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Parse list items from markdown
 */
function parseListItems(content: string): string[] {
  const items: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^[-*]\s+(.+)$/);
    if (match?.[1]) {
      items.push(match[1].trim());
    }
  }

  return items;
}

/**
 * Extract first non-empty paragraph
 */
function extractFirstParagraph(content: string): string {
  const paragraphs = content.split(/\n\n+/);
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('|')) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Determine phase status from tasks
 */
function determinePhaseStatus(
  tasks: Task[]
): 'pending' | 'in_progress' | 'complete' {
  if (tasks.length === 0) return 'pending';
  const completed = tasks.filter((t) => t.status === 'complete' || t.status === 'skipped');
  const inProgress = tasks.filter((t) => t.status === 'in_progress');

  if (completed.length === tasks.length) return 'complete';
  if (inProgress.length > 0 || completed.length > 0) return 'in_progress';
  return 'pending';
}
