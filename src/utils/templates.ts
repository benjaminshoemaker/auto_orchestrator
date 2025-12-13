/**
 * Convert a string to a URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Initial PROJECT.md template with YAML frontmatter
 */
export const INITIAL_PROJECT_MD = `---
version: 1
project_id: "{{PROJECT_ID}}"
project_name: "{{PROJECT_NAME}}"
created: "{{TIMESTAMP}}"
updated: "{{TIMESTAMP}}"
current_phase: 1
current_phase_name: "Idea Refinement"
phase_status: "pending"
gates:
  ideation_complete: false
  ideation_approved: false
  spec_complete: false
  spec_approved: false
  planning_complete: false
  planning_approved: false
cost:
  total_tokens: 0
  total_cost_usd: 0
agent:
  primary: "claude-code"
  timeout_minutes: 10
---

# {{PROJECT_NAME}}

## Phase 1: Idea Refinement

*Status: Pending*

> Awaiting user input to begin ideation phase.

---

## Phase 2: Specification

*Status: Not Started*

---

## Phase 3: Implementation Planning

*Status: Not Started*

---

## Implementation Phases

*No implementation phases defined yet.*

---

## Approvals

| Phase | Status | Approved At | Notes |
|-------|--------|-------------|-------|
| Phase 1 | pending | - | - |
| Phase 2 | pending | - | - |
| Phase 3 | pending | - | - |
`;

/**
 * CLAUDE.md template for agent context
 */
export const CLAUDE_MD_TEMPLATE = `# CLAUDE.md - Agent Context

This file provides context for AI agents working on the **{{PROJECT_NAME}}** project.

## Project Overview

This project is being built using the Orchestrator autonomous development pipeline.

## Current Task

Check PROJECT.md for the current task and its requirements.

## Guidelines

1. **Read PROJECT.md first** - It contains the current phase, task, and acceptance criteria
2. **Follow the task instructions** - Each task has specific requirements
3. **Write tests** - All code should have corresponding tests
4. **Output results** - Write task results to the specified output path

## Code Style

- Use TypeScript with strict mode
- Follow existing patterns in the codebase
- Add JSDoc comments for public APIs
- Run tests before completing a task

## Task Result Format

When completing a task, write a JSON result file with:

\`\`\`json
{
  "task_id": "1.1",
  "status": "success",
  "summary": "Brief description of what was done",
  "files_created": ["list", "of", "files"],
  "files_modified": ["list", "of", "files"],
  "acceptance_criteria": [
    {"criterion": "Description", "met": true}
  ]
}
\`\`\`
`;
