# Implementation Blueprint: Autonomous Development Orchestrator

## Executive Summary

This blueprint provides a complete, step-by-step guide to building the orchestrator. Each step is:

- **Testable**: Every step produces verifiable output
- **Incremental**: Each step builds on the previous
- **Safe**: Small changes reduce risk
- **Integrated**: No orphaned code

**Total**: 34 prompts + 6 manual verification checkpoints
**Estimated Build Time**: 12-18 hours of AI agent execution time

---

## Scope

### Included
- ✅ Sequential task execution
- ✅ Interactive phases 1-3 (ideation, spec, planning)
- ✅ Sub-agent validation of task completion
- ✅ Git workflow (branches per phase, commits per task)
- ✅ CLI commands: init, resume, status, approve, skip, retry
- ✅ Retry logic (simplified: reset task to pending)
- ✅ Cost tracking (logging)
- ✅ PROJECT.md as single source of truth

### Excluded (v2)
- ❌ Parallel task execution
- ❌ Conversation save/resume mid-phase
- ❌ DAG HTML viewer (use status command)
- ❌ Separate CHANGELOG.md
- ❌ Codex CLI / multi-agent failover
- ❌ Langfuse tracing

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                            CLI                                   │
│   init    resume    status    approve    skip    retry   config │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                      Pipeline Orchestrator                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   State     │  │   Phase     │  │  Execution  │             │
│  │  Manager    │  │  Runners    │  │  Engine     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
┌─────────┴────────────────┴────────────────┴─────────────────────┐
│                       Service Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Document   │  │    LLM      │  │    Git      │             │
│  │  Manager    │  │  Service    │  │   Client    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
          │                │                │
┌─────────┴────────────────┴────────────────┴─────────────────────┐
│                        File System                               │
│      PROJECT.md    CLAUDE.md    tasks/results/*.json            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Build Phases

| Phase | Name | Steps | Description |
|-------|------|-------|-------------|
| A | Foundation | 1-5 | Project setup, types, CLI skeleton |
| B | Document Layer | 6-11 | PROJECT.md parsing/writing, task results |
| C | State Management | 12-14 | State coordination, dependencies, phases |
| D | LLM Integration | 15-18 | Anthropic client, prompts, service layer |
| E | Interactive Phases | 19-23 | Terminal UI, phase 1-3 implementation |
| F | Execution Engine | 24-29 | Claude Code adapter, task execution, validation |
| G | Git Workflow | 30-32 | Branches, commits, integration |
| H | Integration | 33-34 | Full pipeline, final testing |

---

# Phase A: Foundation (Steps 1-5)

## Step 1: Project Scaffolding

**Goal**: Initialize TypeScript project with all tooling configured.

```text
Create a new TypeScript project for an "orchestrator" CLI tool.

Requirements:

1. Initialize with npm:
   - name: "@orchestrator/cli"
   - version: "0.1.0"
   - type: "module"
   - bin: { "orchestrator": "./dist/index.js" }

2. Configure TypeScript (tsconfig.json):
   - strict: true
   - target: "ES2022"
   - module: "NodeNext"
   - moduleResolution: "NodeNext"
   - outDir: "./dist"
   - rootDir: "./src"
   - declaration: true

3. Create directory structure:
   ```
   orchestrator/
   ├── src/
   │   ├── index.ts           # CLI entry point (with shebang)
   │   ├── types/             # TypeScript type definitions
   │   ├── lib/               # Core library code
   │   ├── commands/          # CLI command handlers
   │   └── utils/             # Utility functions
   ├── tests/
   │   ├── unit/              # Unit tests
   │   └── integration/       # Integration tests
   ├── package.json
   ├── tsconfig.json
   └── vitest.config.ts
   ```

4. Install dev dependencies:
   - typescript
   - vitest
   - @types/node
   - tsx (for running TS directly during dev)
   - eslint + @typescript-eslint/parser + @typescript-eslint/eslint-plugin
   - prettier

5. Add npm scripts:
   - "build": "tsc"
   - "dev": "tsx src/index.ts"
   - "test": "vitest run"
   - "test:watch": "vitest"
   - "lint": "eslint src --ext .ts"
   - "typecheck": "tsc --noEmit"
   - "format": "prettier --write src"

6. Create src/index.ts:
   ```typescript
   #!/usr/bin/env node
   console.log('Orchestrator v0.1.0');
   ```

7. Create a basic ESLint config (.eslintrc.json) with TypeScript support

8. Create tests/unit/index.test.ts:
   - Test that verifies version string export (create a version constant)

9. Verify all scripts pass: build, test, lint, typecheck

Write all files with complete content. No placeholders.
```

**Verification Checklist**:
- [x] `npm run build` completes without errors
- [x] `npm run dev` prints "Orchestrator v0.1.0"
- [x] `npm test` passes
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes
- [x] Directory structure matches specification

---

## Step 2: Core Type Definitions

**Goal**: Define all TypeScript types for the orchestrator.

```text
Create comprehensive TypeScript type definitions.

File: src/types/index.ts

Define and export all these types:

=== PROJECT.md Types ===

1. ProjectMeta (YAML frontmatter):
   - version: number (schema version, starts at 1)
   - project_id: string
   - project_name: string
   - created: string (ISO date)
   - updated: string (ISO date)
   - current_phase: 1 | 2 | 3 | 'implementation'
   - current_phase_name: string
   - phase_status: 'pending' | 'in_progress' | 'complete' | 'approved'
   - gates: PhaseGates
   - implementation?: ImplementationProgress
   - cost: CostTracking
   - agent: AgentConfig

2. PhaseGates:
   - ideation_complete: boolean
   - ideation_approved: boolean
   - ideation_approved_at?: string
   - spec_complete: boolean
   - spec_approved: boolean
   - spec_approved_at?: string
   - planning_complete: boolean
   - planning_approved: boolean
   - planning_approved_at?: string

3. ImplementationProgress:
   - total_phases: number
   - completed_phases: number
   - current_impl_phase: number
   - current_impl_phase_name: string

4. CostTracking:
   - total_tokens: number
   - total_cost_usd: number

5. AgentConfig:
   - primary: 'claude-code'
   - timeout_minutes: number

6. TaskStatus: 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped'

7. Task:
   - id: string (e.g., "2.3")
   - description: string
   - status: TaskStatus
   - depends_on: string[]
   - acceptance_criteria: string[]
   - started_at?: string
   - completed_at?: string
   - duration_seconds?: number
   - cost_usd?: number
   - commit_hash?: string
   - failure_reason?: string

8. ImplementationPhase:
   - phase_number: number
   - name: string
   - description: string
   - status: 'pending' | 'in_progress' | 'complete'
   - tasks: Task[]

9. Approval:
   - phase: string
   - status: 'pending' | 'approved'
   - approved_at?: string
   - notes?: string

10. ProjectDocument (complete parsed PROJECT.md):
    - meta: ProjectMeta
    - ideation: IdeationContent | null
    - specification: SpecificationContent | null
    - implementation_phases: ImplementationPhase[]
    - approvals: Approval[]

11. IdeationContent:
    - problem_statement: string
    - target_users: string
    - use_cases: string[]
    - success_criteria: string[]
    - constraints: { must_have: string[], nice_to_have: string[], out_of_scope: string[] }
    - raw_content: string

12. SpecificationContent:
    - architecture: string
    - tech_stack: { layer: string, choice: string, rationale: string }[]
    - data_models: string
    - api_contracts: string
    - ui_requirements: string
    - raw_content: string

=== Task Result Types ===

13. TaskResult:
    - task_id: string
    - task_description: string
    - status: 'success' | 'failed'
    - started_at: string
    - completed_at: string
    - duration_seconds: number
    - summary: string
    - files_created: string[]
    - files_modified: string[]
    - files_deleted: string[]
    - key_decisions: { decision: string, rationale: string }[]
    - assumptions: string[]
    - tests_added: number
    - tests_passing: number
    - tests_failing: number
    - test_output?: string
    - acceptance_criteria: { criterion: string, met: boolean, notes?: string }[]
    - validation: ValidationResult
    - tokens_used: number
    - cost_usd: number
    - failure_reason?: string
    - commit_hash?: string

14. ValidationResult:
    - passed: boolean
    - validator_output: string
    - criteria_checked: number
    - criteria_passed: number

=== Config Types ===

15. OrchestratorConfig:
    - project_dir: string
    - agent: AgentConfig
    - git: GitConfig
    - llm: LLMConfig

16. GitConfig:
    - enabled: boolean
    - auto_commit: boolean
    - branch_prefix: string

17. LLMConfig:
    - provider: 'anthropic'
    - model: string
    - max_tokens: number

18. DEFAULT_CONFIG constant with sensible defaults:
    - agent.timeout_minutes: 10
    - git.enabled: true
    - git.auto_commit: true
    - git.branch_prefix: "phase-"
    - llm.model: "claude-sonnet-4-20250514"
    - llm.max_tokens: 8192

=== Error Types ===

File: src/types/errors.ts

19. OrchestratorError extends Error:
    - code: string
    - context?: Record<string, unknown>

20. Subclasses:
    - DocumentParseError
    - StateError
    - TaskExecutionError
    - ValidationError
    - GitError
    - LLMError

Each with appropriate error codes (e.g., 'DOC_PARSE_YAML_INVALID').

Write unit tests in tests/unit/types.test.ts:
- Test that example objects satisfy each interface
- Test error classes have correct inheritance
- Test DEFAULT_CONFIG has all required fields
```

**Verification Checklist**:
- [x] `npm run typecheck` passes
- [x] All types exported from src/types/index.ts
- [x] Error types exported from src/types/errors.ts
- [x] DEFAULT_CONFIG has all fields populated
- [x] Tests pass

---

## Step 3: CLI Skeleton with Commander.js

**Goal**: Set up CLI framework with all commands stubbed.

```text
Set up the CLI using commander.js.

Install: npm install commander chalk

File: src/index.ts

Create the CLI with these commands (all stubbed to log "Not implemented"):

1. orchestrator init <idea>
   - Description: Start a new project from an idea
   - Options:
     --dir, -d <path>: Project directory (default: current)
     --name, -n <n>: Project name (default: slugified idea)

2. orchestrator resume [dir]
   - Description: Resume an existing project
   - Options:
     --dir, -d <path>: Project directory

3. orchestrator status [dir]
   - Description: Show project status
   - Options:
     --dir, -d <path>: Project directory
     --json: Output as JSON

4. orchestrator approve <phase> [dir]
   - Description: Approve a completed phase
   - Arguments: phase (phase-1, phase-2, phase-3, or impl-N)
   - Options:
     --dir, -d <path>: Project directory
     --notes <text>: Approval notes

5. orchestrator skip <task-id> [dir]
   - Description: Skip a task
   - Arguments: task-id (e.g., "2.3")
   - Options:
     --dir, -d <path>: Project directory
     --reason, -r <text>: Reason for skipping (required)

6. orchestrator retry <task-id> [dir]
   - Description: Retry a failed task
   - Arguments: task-id (e.g., "2.3")
   - Options:
     --dir, -d <path>: Project directory

7. orchestrator config [dir]
   - Description: View or modify configuration
   - Options:
     --dir, -d <path>: Project directory
     --set <key=value>: Set a config value
     --get <key>: Get a config value

Global options:
- --version, -V: Show version
- --verbose: Enable verbose logging

File: src/commands/init.ts
File: src/commands/resume.ts
File: src/commands/status.ts
File: src/commands/approve.ts
File: src/commands/skip.ts
File: src/commands/retry.ts
File: src/commands/config.ts

Each command file exports an async function that:
- Receives parsed arguments and options
- Logs "Command <name> not implemented" with received args
- Returns Promise<void>

File: src/utils/logger.ts

Create logger utility using chalk:
- log(message: string): void - normal output
- info(message: string): void - blue
- success(message: string): void - green
- warn(message: string): void - yellow
- error(message: string): void - red
- verbose(message: string): void - gray, only if global verbose flag set
- debug(message: string): void - dim, only if DEBUG env var set

Export a singleton logger instance and a setVerbose(boolean) function.

Write tests in tests/unit/utils/logger.test.ts:
- Test each log level outputs (mock console)
- Test verbose only outputs when enabled

Write tests in tests/integration/cli.test.ts:
- Test --help shows all commands
- Test --version shows version
- Test each command is recognized
- Test unknown command shows error
```

**Verification Checklist**:
- [x] `npm run dev -- --help` shows all 7 commands with descriptions
- [x] `npm run dev -- --version` shows 0.1.0
- [x] `npm run dev -- init "test"` logs stub message
- [x] `npm run dev -- retry 2.3` logs stub message
- [x] All tests pass

---

## Step 4: Project Directory Utilities

**Goal**: Create utilities for working with project directories.

```text
Create utilities for managing orchestrator project directories.

File: src/utils/project.ts

Implement these functions:

1. findProjectRoot(startDir?: string): string | null
   - Search upward from startDir (default: cwd) for PROJECT.md
   - Return directory containing PROJECT.md, or null
   - Stop at filesystem root or after 20 levels

2. initProjectDir(dir: string, projectName: string): Promise<void>
   - Create directory if doesn't exist
   - Create subdirectories: tasks/results
   - Create PROJECT.md with initial meta (use template)
   - Create CLAUDE.md from template
   - Throw DocumentParseError if PROJECT.md already exists

3. validateProjectDir(dir: string): { valid: boolean; issues: string[] }
   - Check PROJECT.md exists
   - Check CLAUDE.md exists
   - Check tasks directory exists
   - Return validation result

4. getProjectPaths(projectDir: string): ProjectPaths
   - Return object with all paths:
     - root: projectDir
     - projectMd: PROJECT.md path
     - claudeMd: CLAUDE.md path
     - tasksResults: tasks/results/ path

5. ProjectPaths interface for return type

File: src/utils/templates.ts

Create template constants:

1. INITIAL_PROJECT_MD: string
   - YAML frontmatter with default meta
   - Empty phase sections with headers
   - Approvals section

2. CLAUDE_MD_TEMPLATE: string
   - Standard Claude Code context
   - Project structure placeholder
   - Code conventions
   - Testing requirements
   - Output format requirements

3. slugify(text: string): string
   - Convert "My Cool Project" to "my-cool-project"
   - Remove special characters
   - Limit length to 50 chars

Write tests in tests/unit/utils/project.test.ts:
- findProjectRoot finds PROJECT.md in ancestors
- findProjectRoot returns null when not found
- initProjectDir creates all files and directories
- initProjectDir throws if PROJECT.md exists
- validateProjectDir catches missing files
- getProjectPaths returns correct paths
- Use temp directories, clean up after

Write tests in tests/unit/utils/templates.test.ts:
- Templates are non-empty strings
- PROJECT.md template has valid YAML between --- delimiters
- slugify handles various inputs correctly
```

**Verification Checklist**:
- [x] findProjectRoot traverses up correctly
- [x] initProjectDir creates complete structure
- [x] validateProjectDir catches all issues
- [x] Templates contain valid content
- [x] slugify produces valid slugs
- [x] All tests pass

---

## Step 5: Wire Init and Status Commands

**Goal**: Implement basic init and status commands.

```text
Implement the init and status commands with basic functionality.

File: src/commands/init.ts

Update init command:

```typescript
import { initProjectDir, getProjectPaths } from '../utils/project';
import { slugify } from '../utils/templates';
import { logger } from '../utils/logger';
import * as path from 'path';

interface InitOptions {
  dir?: string;
  name?: string;
}

export async function initCommand(idea: string, options: InitOptions): Promise<void> {
  const projectDir = path.resolve(options.dir || process.cwd());
  const projectName = options.name || slugify(idea);
  
  logger.info(`Initializing project: ${projectName}`);
  logger.info(`Directory: ${projectDir}`);
  
  try {
    await initProjectDir(projectDir, projectName);
    
    const paths = getProjectPaths(projectDir);
    logger.success('Project initialized!');
    logger.log(`  PROJECT.md: ${paths.projectMd}`);
    logger.log(`  CLAUDE.md: ${paths.claudeMd}`);
    logger.log('');
    logger.log('Next steps:');
    logger.log('  1. Run: orchestrator resume');
    logger.log('  2. Answer questions to refine your idea');
  } catch (err) {
    if (err.code === 'DOC_ALREADY_EXISTS') {
      logger.error('Project already exists in this directory.');
      logger.log('Use a different directory or delete existing PROJECT.md');
      process.exit(1);
    }
    throw err;
  }
}
```

File: src/commands/status.ts

Update status command:

```typescript
import { findProjectRoot, validateProjectDir, getProjectPaths } from '../utils/project';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';

interface StatusOptions {
  dir?: string;
  json?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const startDir = options.dir || process.cwd();
  const projectRoot = findProjectRoot(startDir);
  
  if (!projectRoot) {
    logger.error('Not in an orchestrator project.');
    logger.log('Run "orchestrator init <idea>" to create a project.');
    process.exit(1);
  }
  
  const validation = validateProjectDir(projectRoot);
  if (!validation.valid) {
    logger.error('Invalid project structure:');
    validation.issues.forEach(issue => logger.log(`  - ${issue}`));
    process.exit(1);
  }
  
  // Read PROJECT.md and display basic info
  const paths = getProjectPaths(projectRoot);
  const content = await fs.readFile(paths.projectMd, 'utf-8');
  
  // For now, just show the raw frontmatter exists
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (options.json) {
    console.log(JSON.stringify({ projectRoot, valid: true, hasMeta: !!match }));
  } else {
    logger.info(`Project: ${projectRoot}`);
    logger.log('Status: PROJECT.md found');
    logger.log('');
    logger.log('(Full status display coming in later steps)');
  }
}
```

Write integration tests in tests/integration/commands/init.test.ts:
- Init creates project in specified directory
- Init creates project in current directory
- Init fails if project exists
- Init uses custom name when provided
- Init slugifies idea for default name

Write integration tests in tests/integration/commands/status.test.ts:
- Status finds project in current directory
- Status finds project in parent directory
- Status fails gracefully when not in project
- Status --json outputs valid JSON
```

**Verification Checklist**:
- [x] `orchestrator init "My idea"` creates project structure
- [x] `orchestrator init "My idea" --name custom-name` uses custom name
- [x] `orchestrator init` in existing project fails with clear error
- [x] `orchestrator status` shows basic project info
- [x] `orchestrator status --json` outputs valid JSON
- [x] All tests pass

---

## Manual Checkpoint A

**Before proceeding to Phase B, verify:**

```bash
# 1. Run all tests
npm test

# 2. Build the project
npm run build

# 3. Test CLI end-to-end
mkdir /tmp/test-project && cd /tmp/test-project
npx tsx /path/to/orchestrator/src/index.ts init "A recipe manager app"

# 4. Verify created files
cat PROJECT.md
cat CLAUDE.md
ls -la tasks/

# 5. Test status command
npx tsx /path/to/orchestrator/src/index.ts status
npx tsx /path/to/orchestrator/src/index.ts status --json

# 6. Clean up
rm -rf /tmp/test-project
```

**Checkpoint Checklist**:
- [x] All tests pass (~20 tests)
- [x] Project builds without errors
- [x] Init creates complete directory structure
- [x] PROJECT.md has valid YAML frontmatter
- [x] Status command finds and reports project

---

# Phase B: Document Layer (Steps 6-11)

## Step 6: YAML Frontmatter Parser

**Goal**: Parse and manipulate YAML frontmatter in markdown files.

```text
Create a YAML frontmatter parser for markdown documents.

Install: npm install yaml

File: src/lib/parsers/frontmatter.ts

Implement these functions:

1. extractFrontmatter(content: string): { yaml: string; body: string } | null
   - Extract content between opening and closing --- at start of file
   - Return null if no valid frontmatter
   - Return { yaml: raw yaml string, body: rest of content }

2. parseFrontmatter<T>(content: string): { data: T; body: string }
   - Extract and parse YAML
   - Return typed data and body
   - Throw DocumentParseError if no frontmatter
   - Throw DocumentParseError if invalid YAML (include line number in error)

3. serializeFrontmatter(data: Record<string, unknown>): string
   - Convert object to YAML string
   - Wrap with --- delimiters
   - Use 2-space indentation
   - Don't use flow style for objects/arrays

4. updateFrontmatter<T extends Record<string, unknown>>(
     content: string, 
     updates: Partial<T>
   ): string
   - Parse existing frontmatter
   - Deep merge updates into existing data
   - Serialize back
   - Preserve body content exactly
   - Update the 'updated' field to current ISO timestamp if it exists

5. deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown>
   - Recursively merge objects
   - Arrays are replaced, not merged
   - Handle null/undefined properly

Write tests in tests/unit/lib/parsers/frontmatter.test.ts:
- extractFrontmatter with valid frontmatter
- extractFrontmatter with no frontmatter returns null
- extractFrontmatter with unclosed frontmatter returns null
- parseFrontmatter returns typed data
- parseFrontmatter throws on invalid YAML with line info
- serializeFrontmatter produces valid YAML
- updateFrontmatter merges correctly
- updateFrontmatter preserves body exactly
- updateFrontmatter updates 'updated' timestamp
- deepMerge handles nested objects
- deepMerge replaces arrays
```

**Verification Checklist**:
- [x] Extract handles edge cases correctly
- [x] Parse returns typed data
- [x] Serialize produces clean YAML
- [x] Update preserves body content and auto-updates 'updated' timestamp
- [x] Deep merge works correctly
- [x] All tests pass

---

## Step 7: PROJECT.md Parser

**Goal**: Parse PROJECT.md into typed ProjectDocument structure.

```text
Create a parser for PROJECT.md files.

File: src/lib/parsers/project-parser.ts

Implement the ProjectParser class:

```typescript
import { ProjectDocument, ProjectMeta, ImplementationPhase, Task, TaskStatus, Approval, IdeationContent, SpecificationContent } from '../../types';

export class ProjectParser {
  parse(content: string): ProjectDocument
  async parseFile(filePath: string): Promise<ProjectDocument>
}
```

Implementation details:

1. parse(content: string) should:
   
   a. Parse YAML frontmatter into ProjectMeta
      - Validate required fields exist
      - Throw DocumentParseError with details if invalid
   
   b. Parse markdown sections by ## headers:
      - "## Phase 1: Idea Refinement" → IdeationContent
      - "## Phase 2: Specification" → SpecificationContent  
      - "## Phase 3: Implementation Plan" → ImplementationPhase[]
      - "## Approvals" → Approval[]
   
   c. For Phase 3, parse implementation phases:
      - Find "### Implementation Phase N: Name" headers
      - Parse markdown tables into Task[]
      - Table columns: Task | Description | Status | Depends On | Acceptance Criteria
   
   d. Parse task status markers:
      - "⏳ PENDING" or "pending" → 'pending'
      - "🔄 IN_PROGRESS" or "in_progress" → 'in_progress'
      - "✅ COMPLETE" or "complete" → 'complete'
      - "❌ FAILED" or "failed" → 'failed'
      - "⏭️ SKIPPED" or "skipped" → 'skipped'
   
   e. Parse depends_on from comma-separated task IDs
   
   f. Parse acceptance criteria from bullet list in cell (split by <br> or newlines)

Helper functions to implement:

1. parseSection(content: string, header: string): string | null
   - Extract content under ## header until next ## header

2. parseTaskTable(markdown: string): Task[]
   - Parse markdown table into Task objects
   - Handle missing cells gracefully

3. parseStatusMarker(text: string): TaskStatus
   - Convert various formats to TaskStatus enum

4. parseApprovals(content: string): Approval[]
   - Parse approval subsections

5. isValidProjectMeta(obj: unknown): obj is ProjectMeta
   - Type guard for validation

Write tests in tests/unit/lib/parsers/project-parser.test.ts:
- Parse minimal PROJECT.md (just meta)
- Parse PROJECT.md with ideation content
- Parse PROJECT.md with specification content
- Parse PROJECT.md with implementation phases
- Parse task table with all status types
- Parse dependencies correctly
- Parse acceptance criteria
- Parse approvals section
- Throw on missing required meta fields
- Handle malformed tables gracefully

Create test fixture: tests/fixtures/sample-project.md
- Complete example with all sections filled in
```

**Verification Checklist**:
- [x] Parses YAML meta correctly
- [x] Extracts all section content
- [x] Parses task tables into Task objects
- [x] Status markers convert correctly (uses ✅❌⏳🔄⏭️)
- [x] Dependencies parsed from comma-separated
- [x] Acceptance criteria split correctly from semicolon-separated 5th column
- [x] Approvals section parsed
- [x] All tests pass

---

## Step 8: PROJECT.md Writer

**Goal**: Write and update PROJECT.md files.

```text
Create a writer for PROJECT.md files.

File: src/lib/writers/project-writer.ts

Implement the ProjectWriter class:

```typescript
import { ProjectDocument, ProjectMeta, Task, TaskStatus, ImplementationPhase, Approval } from '../../types';

export class ProjectWriter {
  // Generate complete PROJECT.md content
  write(doc: ProjectDocument): string
  
  // Write to file
  async writeFile(doc: ProjectDocument, filePath: string): Promise<void>
  
  // Update just the meta section
  updateMeta(content: string, updates: Partial<ProjectMeta>): string
  
  // Update a single task's status and fields
  updateTask(content: string, taskId: string, updates: Partial<Task>): string
  
  // Add or update an approval
  updateApproval(content: string, approval: Approval): string
  
  // Add a new implementation phase section
  addImplementationPhase(content: string, phase: ImplementationPhase): string
  
  // Update phase 1 content (ideation)
  updateIdeationContent(content: string, ideation: IdeationContent): string
  
  // Update phase 2 content (specification)
  updateSpecificationContent(content: string, spec: SpecificationContent): string
}
```

Implementation details:

1. write() generates complete markdown:
   - Frontmatter from meta
   - Phase 1 section with ideation content (or placeholder)
   - Phase 2 section with spec content (or placeholder)
   - Phase 3 section with implementation phases as task tables
   - Approvals section

2. updateTask() should:
   - Find task row by ID in task table
   - Update status marker
   - Update other fields if provided
   - Preserve table formatting

3. Task status to marker:
   - 'pending' → "⏳"
   - 'in_progress' → "🔄"
   - 'complete' → "✅"
   - 'failed' → "❌"
   - 'skipped' → "⏭️"

4. formatTaskTable(tasks: Task[]): string
   - Generate markdown table
   - Columns: Task | Description | Status | Depends On | Acceptance Criteria
   - Proper alignment markers (|---|)

5. formatAcceptanceCriteria(criteria: string[]): string
   - Join with <br> for table cell display

Write tests in tests/unit/lib/writers/project-writer.test.ts:
- write() produces valid markdown
- Round-trip: parse → write → parse produces equivalent data
- updateMeta preserves body
- updateTask finds correct row
- updateTask changes status marker
- updateApproval adds new approval
- updateApproval updates existing approval
- formatTaskTable produces valid markdown table
```

**Verification Checklist**:
- [x] write() produces complete valid PROJECT.md
- [x] Round-trip preserves data
- [x] updateTask modifies correct row
- [x] updateApproval works for add and update
- [x] Tables format correctly with emoji status markers
- [x] All tests pass

---

## Step 9: Task Result Manager

**Goal**: Read and write task result JSON files.

```text
Create manager for task result JSON files.

File: src/lib/task-results.ts

Implement the TaskResultManager class:

```typescript
import { TaskResult } from '../types';

export class TaskResultManager {
  constructor(private projectDir: string)
  
  // Get path for a task result
  getResultPath(taskId: string): string
  
  // Write a task result
  async writeResult(result: TaskResult): Promise<void>
  
  // Read a task result
  async readResult(taskId: string): Promise<TaskResult | null>
  
  // Check if result exists
  async resultExists(taskId: string): Promise<boolean>
  
  // Read all results
  async readAllResults(): Promise<TaskResult[]>
  
  // Delete a task result (for retry)
  async deleteResult(taskId: string): Promise<boolean>
  
  // Get total cost from all results
  async getTotalCost(): Promise<number>
  
  // Get total tokens from all results
  async getTotalTokens(): Promise<number>
}
```

Implementation details:

1. File naming: tasks/results/task-{id}.json
   - Task ID "2.3" → "task-2.3.json"

2. writeResult() should:
   - Validate result has required fields
   - Create directory if doesn't exist
   - Write pretty-printed JSON (2-space indent)

3. readResult() should:
   - Return null if file doesn't exist
   - Parse JSON
   - Validate structure, throw if invalid

4. readAllResults() should:
   - Scan tasks/results/ directory
   - Read all .json files
   - Parse each, skip invalid files with warning
   - Return sorted by task ID

5. deleteResult() should:
   - Delete the JSON file if it exists
   - Return true if deleted, false if didn't exist
   - Used when retrying a task

Also implement:

6. isValidTaskResult(obj: unknown): obj is TaskResult
   - Type guard checking all required fields

7. createTaskResult(taskId: string, description: string): TaskResult
   - Factory function creating empty result with defaults
   - status: 'failed' (must be explicitly set to success)
   - timestamps set to now
   - empty arrays for files, decisions, etc.

Write tests in tests/unit/lib/task-results.test.ts:
- writeResult creates valid JSON file
- readResult returns parsed result
- readResult returns null for missing file
- readAllResults finds all results
- deleteResult removes file
- getTotalCost sums correctly
- isValidTaskResult validates correctly
- createTaskResult sets defaults
- Use temp directory, clean up
```

**Verification Checklist**:
- [x] File paths generated correctly
- [x] Write creates valid JSON
- [x] Read handles missing files
- [x] Read validates structure
- [x] Delete removes file correctly
- [x] Cost calculation correct
- [x] All tests pass

---

## Step 10: CLAUDE.md Manager

**Goal**: Manage CLAUDE.md with task context injection.

```text
Create manager for CLAUDE.md files.

File: src/lib/claude-md.ts

Implement the ClaudeMdManager class:

```typescript
import { Task, ImplementationPhase, TaskResult } from '../types';

interface TaskContext {
  task: Task;
  phase: ImplementationPhase;
  dependencyResults: TaskResult[];
}

export class ClaudeMdManager {
  constructor(private projectDir: string)
  
  // Check if CLAUDE.md exists
  async exists(): Promise<boolean>
  
  // Read current content
  async read(): Promise<string>
  
  // Initialize from template
  async initialize(projectName: string, projectDescription: string): Promise<void>
  
  // Build full context for task execution
  async buildTaskContext(context: TaskContext): Promise<string>
  
  // Update project info section
  async updateProjectInfo(name: string, description: string, techStack?: string): Promise<void>
}
```

Implementation details:

1. buildTaskContext() generates complete prompt:
   
   ```markdown
   [Contents of CLAUDE.md]
   
   ---
   
   ## Current Task
   
   **Task ID:** {task.id}
   **Phase:** {phase.name}
   **Description:** {task.description}
   
   ### Acceptance Criteria
   
   You must satisfy ALL of the following:
   
   - [ ] {criterion 1}
   - [ ] {criterion 2}
   ...
   
   ### Completed Dependencies
   
   The following tasks have been completed. Use their outputs as needed:
   
   #### Task {dep.task_id}: {dep.task_description}
   
   **Summary:** {dep.summary}
   
   **Files created:** {dep.files_created.join(', ')}
   
   **Key decisions:**
   - {decision.decision}: {decision.rationale}
   
   ---
   
   ### Instructions
   
   1. Read relevant codebase files to understand context
   2. Write failing tests first (TDD)
   3. Implement code to make tests pass
   4. Run all tests: npm test
   5. Write results JSON to: tasks/results/task-{id}.json
   
   ### Output Format
   
   Create tasks/results/task-{task.id}.json with this structure:
   
   {JSON schema example}
   
   IMPORTANT: Set status to "success" only if ALL acceptance criteria are met and all tests pass.
   ```

2. The template should include:
   - Project overview placeholder
   - Standard code conventions
   - Test requirements (TDD)
   - Output format specification with example JSON

Write tests in tests/unit/lib/claude-md.test.ts:
- exists() returns correct boolean
- read() returns content
- initialize() creates from template
- buildTaskContext() includes task details
- buildTaskContext() includes all dependencies
- buildTaskContext() includes acceptance criteria
- buildTaskContext() includes output format
- Use temp directory
```

**Verification Checklist**:
- [x] exists() works correctly
- [x] read() returns file content
- [x] initialize() creates valid CLAUDE.md
- [x] buildTaskContext() includes all sections
- [x] Dependencies formatted correctly
- [x] Output format clearly specified
- [x] All tests pass

---

## Step 11: Document Manager Facade

**Goal**: Create unified interface for all document operations.

```text
Create a facade coordinating all document operations.

File: src/lib/documents.ts

Implement the DocumentManager class:

```typescript
import { ProjectDocument, ProjectMeta, Task, TaskStatus, TaskResult, ImplementationPhase, Approval, IdeationContent, SpecificationContent } from '../types';
import { ProjectParser } from './parsers/project-parser';
import { ProjectWriter } from './writers/project-writer';
import { TaskResultManager } from './task-results';
import { ClaudeMdManager } from './claude-md';

export class DocumentManager {
  private parser: ProjectParser;
  private writer: ProjectWriter;
  private taskResults: TaskResultManager;
  private claudeMd: ClaudeMdManager;
  
  constructor(private projectDir: string)
  
  // === Project Document ===
  
  async readProject(): Promise<ProjectDocument>
  
  async updateProjectMeta(updates: Partial<ProjectMeta>): Promise<void>
  
  async updateTask(taskId: string, updates: Partial<Task>): Promise<void>
  
  async updateApproval(approval: Approval): Promise<void>
  
  async updateIdeation(content: IdeationContent): Promise<void>
  
  async updateSpecification(content: SpecificationContent): Promise<void>
  
  async addImplementationPhase(phase: ImplementationPhase): Promise<void>
  
  // === Task Results ===
  
  async saveTaskResult(result: TaskResult): Promise<void>
  
  async getTaskResult(taskId: string): Promise<TaskResult | null>
  
  async getAllTaskResults(): Promise<TaskResult[]>
  
  async deleteTaskResult(taskId: string): Promise<boolean>
  
  async getCostSummary(): Promise<{ tokens: number; cost: number }>
  
  // === CLAUDE.md ===
  
  async buildTaskPrompt(task: Task, phase: ImplementationPhase): Promise<string>
  
  // === Initialization ===
  
  async initialize(projectName: string, description: string): Promise<void>
  
  // === Validation ===
  
  async validate(): Promise<{ valid: boolean; issues: string[] }>
}
```

Implementation:

1. All methods should:
   - Handle file I/O errors gracefully
   - Use logger for debugging
   - Throw typed errors (DocumentParseError, etc.)

2. buildTaskPrompt() should:
   - Get dependency task IDs from task.depends_on
   - Load TaskResult for each dependency
   - Call claudeMd.buildTaskContext()

3. validate() should:
   - Check all required files exist
   - Parse PROJECT.md to verify valid
   - Check task results match tasks in PROJECT.md
   - Return issues found

4. initialize() should:
   - Create PROJECT.md with initial template
   - Create CLAUDE.md with template
   - Create tasks/results directory

Write tests in tests/integration/documents.test.ts:
- Initialize creates all files
- readProject returns parsed document
- updateTask modifies and persists
- saveTaskResult creates JSON file
- deleteTaskResult removes file
- buildTaskPrompt includes dependencies
- validate catches inconsistencies
- Use temp directory
```

**Verification Checklist**:
- [x] initialize() creates all required files
- [x] Read/update operations work correctly
- [x] Task results saved, retrieved, deleted
- [x] buildTaskPrompt includes all context
- [x] validate() catches issues
- [x] All tests pass

---

## Manual Checkpoint B

**Before proceeding to Phase C, verify:**

```bash
# 1. Run all tests
npm test

# 2. Create test project
mkdir /tmp/doc-test && cd /tmp/doc-test
orchestrator init "Test document parsing"

# 3. Manually add some content to PROJECT.md
# Add a task table to Phase 3 section

# 4. Test parsing
# Create a test script to parse and display:
cat > test-parse.ts << 'EOF'
import { DocumentManager } from './src/lib/documents';
const dm = new DocumentManager('/tmp/doc-test');
const doc = await dm.readProject();
console.log(JSON.stringify(doc, null, 2));
EOF
npx tsx test-parse.ts

# 5. Clean up
rm -rf /tmp/doc-test
```

**Checkpoint Checklist**:
- [x] All tests pass (~55 tests)
- [x] PROJECT.md parses correctly
- [x] Task tables parse into Task objects
- [x] Document updates persist correctly
- [x] Round-trip (parse-write-parse) works

---

# Phase C: State Management (Steps 12-14)

## Step 12: State Manager

**Goal**: Create centralized state management.

```text
Create a state manager coordinating in-memory state with file persistence.

File: src/lib/state/state-manager.ts

```typescript
import { ProjectDocument, ProjectMeta, Task, TaskStatus, TaskResult, ImplementationPhase, Approval } from '../../types';
import { DocumentManager } from '../documents';

type StateEventType = 'task_started' | 'task_completed' | 'task_failed' | 'task_retried' | 'phase_completed' | 'approval_added' | 'cost_updated';

interface StateEvent {
  type: StateEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

type StateEventHandler = (event: StateEvent) => void;

export class StateManager {
  private doc: ProjectDocument | null = null;
  private taskResults: Map<string, TaskResult> = new Map();
  private dirty: boolean = false;
  private eventHandlers: Map<StateEventType, StateEventHandler[]> = new Map();
  
  constructor(
    private documentManager: DocumentManager,
    private projectDir: string
  )
  
  // === Lifecycle ===
  
  async load(): Promise<void>
  // Load PROJECT.md and all task results into memory
  
  async save(): Promise<void>
  // Persist changes if dirty
  
  // === Read State ===
  
  getProject(): ProjectDocument
  // Return current project doc (throw if not loaded)
  
  getMeta(): ProjectMeta
  
  getCurrentPhase(): number | 'implementation'
  
  getCurrentImplPhase(): ImplementationPhase | null
  // Return current implementation phase, or null if not in implementation
  
  getTask(taskId: string): Task | null
  
  getTaskResult(taskId: string): TaskResult | null
  
  getAllTasks(): Task[]
  // Return all tasks from all implementation phases
  
  // === State Queries ===
  
  getNextTask(): Task | null
  // Return next pending task (respecting dependencies)
  
  getPendingTasks(): Task[]
  
  getCompletedTasks(): Task[]
  
  getFailedTasks(): Task[]
  
  isTaskComplete(taskId: string): boolean
  
  areAllDependenciesComplete(taskId: string): boolean
  
  isCurrentPhaseComplete(): boolean
  
  // === State Mutations ===
  
  startTask(taskId: string): void
  // Mark task as in_progress, set started_at, set dirty
  
  completeTask(taskId: string, result: TaskResult): void
  // Mark task complete, store result, update cost, set dirty
  
  failTask(taskId: string, result: TaskResult): void
  // Mark task failed, store result, set dirty
  
  skipTask(taskId: string, reason: string): void
  // Mark task skipped with reason, set dirty
  
  retryTask(taskId: string): void
  // Reset task to pending, clear failure info, delete old result, set dirty
  
  approvePhase(phase: string, notes?: string): void
  // Add approval, update gates, set dirty
  
  setIdeationContent(content: IdeationContent): void
  
  setSpecificationContent(content: SpecificationContent): void
  
  addImplementationPhases(phases: ImplementationPhase[]): void
  
  // === Cost Tracking ===
  
  addCost(tokens: number, costUsd: number): void
  
  getTotalCost(): { tokens: number; cost: number }
  
  // === Events ===
  
  on(event: StateEventType, handler: StateEventHandler): void
  
  private emit(type: StateEventType, data: Record<string, unknown>): void
}
```

Implementation details:

1. load() should:
   - Call documentManager.readProject()
   - Load all task results
   - Store in memory
   - Set dirty = false

2. save() should:
   - Only write if dirty
   - Update PROJECT.md meta (including updated timestamp)
   - Write any updated task results
   - Set dirty = false

3. getNextTask() should:
   - Get current implementation phase
   - Find first pending task where all depends_on are complete
   - Return null if none found or not in implementation

4. retryTask() should:
   - Find the task by ID
   - Check task is in failed status (throw StateError if not)
   - Reset status to 'pending'
   - Clear failure_reason, started_at, completed_at, duration_seconds
   - Delete the task result file via documentManager
   - Set dirty = true
   - Emit 'task_retried' event

5. Other mutations should:
   - Update in-memory state
   - Set dirty = true
   - Emit appropriate event
   - NOT write to files

Write tests in tests/unit/lib/state/state-manager.test.ts:
- load() populates state
- save() persists when dirty
- save() skips when not dirty
- getNextTask() respects dependencies
- getNextTask() returns null when all done
- startTask() sets status and timestamp
- completeTask() stores result
- retryTask() resets to pending
- retryTask() throws if task not failed
- retryTask() deletes result file
- Events emitted correctly
```

**Verification Checklist**:
- [x] load() populates from files
- [x] save() persists changes
- [x] getNextTask() respects dependencies
- [x] retryTask() resets task correctly and deletes result file from disk
- [x] All mutations set dirty flag
- [x] Events emitted on mutations
- [x] All tests pass

---

## Step 13: Dependency Resolver

**Goal**: Implement dependency resolution for task ordering.

```text
Create dependency resolver for determining task execution order.

File: src/lib/state/dependency-resolver.ts

```typescript
import { Task } from '../../types';

interface DependencyIssue {
  type: 'missing' | 'circular' | 'self_reference';
  taskId: string;
  details: string;
}

interface ValidationResult {
  valid: boolean;
  issues: DependencyIssue[];
}

export class DependencyResolver {
  constructor(private tasks: Task[])
  
  // Validate the dependency graph
  validate(): ValidationResult
  
  // Check if a task can run (all deps complete)
  canRun(taskId: string): boolean
  
  // Get incomplete dependencies for a task
  getBlockingDeps(taskId: string): string[]
  
  // Get next task that can run
  getNextRunnable(): Task | null
  
  // Get all tasks in topological order
  getExecutionOrder(): Task[]
  
  // Check for circular dependencies
  findCycles(): string[][] 
  // Return array of cycles, each cycle is array of task IDs
}
```

Implementation details:

1. validate() checks:
   - All depends_on references exist
   - No self-references
   - No circular dependencies
   - Return all issues found

2. canRun(taskId) checks:
   - Task exists and is pending
   - All depends_on tasks have status 'complete'

3. getBlockingDeps(taskId) returns:
   - Task IDs from depends_on that are not complete
   - Empty array if task can run

4. getNextRunnable() returns:
   - First pending task where canRun() is true
   - Tasks checked in ID order (1.1, 1.2, 2.1, etc.)
   - null if no runnable tasks

5. getExecutionOrder() uses:
   - Kahn's algorithm for topological sort
   - Throw if cycle detected

6. findCycles() uses:
   - DFS with coloring (white/gray/black)
   - Return all cycles found

Write tests in tests/unit/lib/state/dependency-resolver.test.ts:
- Linear dependencies (A→B→C)
- Diamond dependencies (A→B, A→C, B→D, C→D)
- No dependencies (all can run)
- Circular dependency detection (A→B→C→A)
- Self-reference detection
- Missing dependency detection
- getNextRunnable with partial completion
- getExecutionOrder produces valid order
```

**Verification Checklist**:
- [x] validate() finds all issues
- [x] canRun() checks dependencies correctly
- [x] getBlockingDeps() returns correct blockers
- [x] getNextRunnable() respects completion status
- [x] getExecutionOrder() produces valid topological order
- [x] Cycles detected correctly
- [x] All tests pass

---

## Step 14: Phase Manager

**Goal**: Manage phase transitions and readiness checks.

```text
Create phase manager for phase transitions.

File: src/lib/state/phase-manager.ts

```typescript
import { StateManager } from './state-manager';

interface ReadinessItem {
  item: string;
  complete: boolean;
  required: boolean;
}

interface ReadinessResult {
  ready: boolean;
  checklist: ReadinessItem[];
  blockers: string[];
}

interface PhaseInfo {
  phase: number | 'implementation';
  name: string;
  status: 'not_started' | 'in_progress' | 'complete' | 'approved';
}

export class PhaseManager {
  constructor(private state: StateManager)
  
  // Get current phase info
  getCurrentPhase(): PhaseInfo
  
  // Get phase status
  getPhaseStatus(phase: number | 'implementation'): PhaseInfo['status']
  
  // Check if phase is complete
  isPhaseComplete(phase: number | 'implementation'): boolean
  
  // Check if phase is approved  
  isPhaseApproved(phase: number | 'implementation'): boolean
  
  // Get readiness checklist for approval
  getReadinessForApproval(phase: number | string): ReadinessResult
  
  // Check if can transition to next phase
  canProceedToNextPhase(): { canProceed: boolean; reason?: string }
  
  // Transition to next phase
  proceedToNextPhase(): void
  
  // Get current implementation phase number (1-indexed)
  getCurrentImplPhaseNumber(): number | null
  
  // Check if current impl phase is complete
  isCurrentImplPhaseComplete(): boolean
  
  // Advance to next implementation phase
  advanceImplPhase(): void
}
```

Implementation details:

1. Readiness checklists:

   Phase 1 (Ideation):
   - Problem statement defined (check ideation.problem_statement not empty)
   - Target users identified
   - At least 3 use cases
   - Success criteria defined
   - Constraints defined
   
   Phase 2 (Specification):
   - Architecture defined
   - Tech stack selected
   - Data models defined
   - API contracts defined
   
   Phase 3 (Planning):
   - At least one implementation phase
   - All phases have tasks
   - All tasks have acceptance criteria
   - No dependency issues
   
   Implementation phases:
   - All tasks complete or skipped
   - No failed tasks (user must retry or skip)

2. canProceedToNextPhase() checks:
   - Current phase is approved
   - If implementation, current impl phase complete and approved

3. proceedToNextPhase() should:
   - Update meta.current_phase
   - Update meta.current_phase_name
   - Update meta.phase_status to 'in_progress'
   - Call state.save()

4. advanceImplPhase() should:
   - Update implementation progress
   - Set next phase as current
   - Keep on same phase branch

Write tests in tests/unit/lib/state/phase-manager.test.ts:
- Readiness checklist for each phase
- isPhaseComplete for various states
- canProceedToNextPhase logic
- proceedToNextPhase updates state
- Implementation phase advancement
- Impl phase not ready if failed tasks exist
```

**Verification Checklist**:
- [x] Readiness checklists complete for all phases
- [x] isPhaseComplete accurate
- [x] canProceedToNextPhase enforces rules
- [x] Failed tasks block impl phase completion
- [x] Transitions update state correctly
- [x] Impl phase advancement works
- [x] All tests pass

---

## Manual Checkpoint C

**Before proceeding to Phase D, verify:**

```bash
# 1. Run all tests  
npm test

# 2. Create a test project with tasks
# Manually edit PROJECT.md to add implementation phases and tasks

# 3. Test state loading and dependency resolution
cat > test-state.ts << 'EOF'
import { DocumentManager } from './src/lib/documents';
import { StateManager } from './src/lib/state/state-manager';
import { DependencyResolver } from './src/lib/state/dependency-resolver';

const dm = new DocumentManager('/tmp/state-test');
const state = new StateManager(dm, '/tmp/state-test');
await state.load();

const tasks = state.getAllTasks();
const resolver = new DependencyResolver(tasks);
console.log('Validation:', resolver.validate());
console.log('Execution order:', resolver.getExecutionOrder().map(t => t.id));
console.log('Next runnable:', resolver.getNextRunnable()?.id);
EOF
npx tsx test-state.ts
```

**Checkpoint Checklist**:
- [x] All tests pass (~75 tests)
- [x] State loads from files correctly
- [x] Dependency resolver validates correctly
- [x] Execution order is correct
- [x] Phase transitions work
- [x] Retry task resets correctly

---

# Phase D: LLM Integration (Steps 15-18)

## Step 15: Anthropic Client

**Goal**: Create typed wrapper for Anthropic SDK.

```text
Create a wrapper for the Anthropic SDK.

Install: npm install @anthropic-ai/sdk

File: src/lib/llm/anthropic-client.ts

```typescript
import Anthropic from '@anthropic-ai/sdk';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

interface CompletionResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

export class AnthropicClient {
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;
  
  constructor(config?: { 
    apiKey?: string; 
    model?: string; 
    maxTokens?: number;
  })
  // Use ANTHROPIC_API_KEY env var if not provided
  // Default model: claude-sonnet-4-20250514
  // Default maxTokens: 8192
  // Throw LLMError if no API key
  
  async complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult>
  // Send single prompt, return response with token counts
  
  async chat(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>
  // Send message history, return response
  
  async *stream(prompt: string, options?: CompletionOptions): AsyncGenerator<string, CompletionResult>
  // Stream response tokens, yield each chunk, return final result
  
  calculateCost(inputTokens: number, outputTokens: number, model?: string): number
  // Calculate cost in USD based on current pricing
  // claude-sonnet-4-20250514: $3/M input, $15/M output
  
  estimateTokens(text: string): number
  // Rough estimate: ~4 chars per token
}
```

Implementation:

1. complete() converts prompt to single user message and calls chat()

2. chat() calls Anthropic messages.create():
   ```typescript
   const response = await this.client.messages.create({
     model: options?.model || this.defaultModel,
     max_tokens: options?.maxTokens || this.defaultMaxTokens,
     system: options?.system,
     messages: messages.map(m => ({ role: m.role, content: m.content })),
   });
   ```

3. stream() uses messages.stream():
   ```typescript
   const stream = this.client.messages.stream({...});
   for await (const event of stream) {
     if (event.type === 'content_block_delta') {
       yield event.delta.text;
     }
   }
   return stream.finalMessage(); // Get token counts
   ```

4. Error handling:
   - Wrap Anthropic errors in LLMError
   - Include rate limit info if applicable
   - Include request ID for debugging

Write tests in tests/unit/lib/llm/anthropic-client.test.ts:
- Mock Anthropic client for unit tests
- Test complete() formats request correctly
- Test chat() sends messages
- Test calculateCost() accurate
- Test estimateTokens() reasonable
- Test missing API key throws LLMError
```

**Verification Checklist**:
- [x] Client initializes with env var or config (throws LLMError.apiKeyMissing())
- [x] complete() returns typed result
- [x] chat() handles message history
- [x] stream() yields chunks
- [x] calculateCost() accurate for models
- [x] Errors wrapped in LLMError via wrapApiError() helper
- [x] All tests pass

---

## Step 16: Conversation Handler

**Goal**: Manage multi-turn conversations.

```text
Create conversation handler for interactive phases.

File: src/lib/llm/conversation.ts

```typescript
import { AnthropicClient, Message, CompletionResult } from './anthropic-client';

interface ConversationConfig {
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  onToken?: (token: string) => void;  // For streaming display
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens?: number;
}

export class Conversation {
  private turns: Turn[] = [];
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;
  
  constructor(
    private client: AnthropicClient,
    private config: ConversationConfig
  )
  
  // Send message, get response
  async send(message: string): Promise<string>
  
  // Send with streaming output
  async sendStreaming(message: string): Promise<string>
  
  // Get all turns
  getHistory(): Turn[]
  
  // Get token counts
  getTokenCounts(): { input: number; output: number }
  
  // Get total cost
  getTotalCost(): number
  
  // Get number of turns
  getTurnCount(): number
  
  // Clear conversation (keep config)
  reset(): void
}
```

Implementation:

1. send() should:
   - Add user message to turns
   - Build messages array from turns
   - Call client.chat() with system prompt
   - Add assistant response to turns
   - Update token counts
   - Return response content

2. sendStreaming() should:
   - Same as send but use client.stream()
   - Call config.onToken() for each chunk
   - Return complete response

3. getHistory() returns copy of turns array

4. Token tracking:
   - Track cumulative input/output tokens
   - Each turn adds to the total

Write tests in tests/unit/lib/llm/conversation.test.ts:
- Single turn works
- Multi-turn maintains context
- Token tracking cumulative
- Cost calculation accurate
- Streaming calls onToken
- reset() clears turns but keeps config
```

**Verification Checklist**:
- [x] send() adds turns correctly
- [x] Multi-turn preserves history
- [x] Token tracking accurate
- [x] Cost calculation works
- [x] Streaming output works
- [x] All tests pass

---

## Step 17: Phase Prompts

**Goal**: Create system prompts and builders for each phase.

```text
Create prompt templates for interactive phases.

File: src/lib/llm/prompts/base.ts

```typescript
export const BASE_SYSTEM_PROMPT = `You are an expert software architect and product manager helping design a software project.

Guidelines:
- Ask one focused question at a time
- Be specific and actionable
- When you have enough information, produce structured output
- Use markdown formatting
- Be concise but thorough`;

export function isReadySignal(response: string, phase: number): boolean
// Check if response contains phase completion signal
```

File: src/lib/llm/prompts/ideation.ts

```typescript
export const IDEATION_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are in Phase 1: Idea Refinement.

Your goal is to understand the software idea thoroughly by asking about:
1. The problem being solved and who experiences it
2. Current alternatives and their shortcomings
3. Core use cases (need at least 3 specific scenarios)
4. Success criteria (measurable outcomes)
5. Constraints (must have, nice to have, out of scope)

Ask questions ONE AT A TIME. After each answer, either ask a follow-up or move to the next topic.

When you have gathered sufficient information, output a structured summary using EXACTLY this format:

## Summary

### Problem Statement
[Clear description of the problem]

### Target Users
[Who experiences this problem]

### Use Cases
1. [Specific use case 1]
2. [Specific use case 2]
3. [Specific use case 3]
[Add more if discussed]

### Success Criteria
- [Measurable criterion 1]
- [Measurable criterion 2]

### Constraints

**Must Have:**
- [Requirement 1]

**Nice to Have:**
- [Optional feature 1]

**Out of Scope:**
- [Excluded item 1]

---
PHASE_1_COMPLETE
---`;

export function buildIdeationOpener(idea: string): string {
  return `The user wants to build: "${idea}"

Start by understanding this idea. Ask your first clarifying question about the core problem being solved.`;
}

export function parseIdeationResult(response: string): IdeationContent | null
// Parse the structured output into IdeationContent
// Return null if not in expected format
```

File: src/lib/llm/prompts/specification.ts

```typescript
export const SPEC_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are in Phase 2: Specification.

Given the requirements from Phase 1, create a technical specification by determining:
1. Architecture pattern (monolith, microservices, serverless, etc.)
2. Tech stack with rationale for each choice
3. Data models (key entities and relationships)
4. API contracts (main endpoints)
5. UI/UX requirements (screens, flows)

Make recommendations based on the requirements. Ask clarifying questions only if critical information is missing.

When complete, output the specification using EXACTLY this format:

## Technical Specification

### Architecture
[Pattern and rationale]

### Tech Stack
| Layer | Choice | Rationale |
|-------|--------|-----------|
| [layer] | [tech] | [why] |

### Data Models
\`\`\`typescript
[Key interfaces/types]
\`\`\`

### API Contracts
[Main endpoints with request/response shapes]

### UI/UX Requirements
[Key screens and user flows]

---
PHASE_2_COMPLETE
---`;

export function buildSpecOpener(ideation: IdeationContent): string
// Format ideation results as context for spec phase

export function parseSpecResult(response: string): SpecificationContent | null
```

File: src/lib/llm/prompts/planning.ts

```typescript
export const PLANNING_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are in Phase 3: Implementation Planning.

Given the specification, create a detailed implementation plan:
1. Break into implementation phases (2-5 phases, each a testable milestone)
2. Within each phase, define small tasks
3. Each task should be 15-30 minutes of work for an AI coding agent
4. Define clear dependencies between tasks
5. Write specific acceptance criteria for each task

Task guidelines:
- Tasks should produce testable output
- Prefer many small tasks over few large ones
- Earlier tasks should set up foundations
- Later tasks build on earlier work

Output the plan using EXACTLY this format:

## Implementation Plan

### Implementation Phase 1: [Name]
[Brief description of what this phase accomplishes]

| Task | Description | Depends On | Acceptance Criteria |
|------|-------------|------------|---------------------|
| 1.1 | [Short description] | - | [Criterion 1]; [Criterion 2] |
| 1.2 | [Description] | 1.1 | [Criteria] |

### Implementation Phase 2: [Name]
[Description]

| Task | Description | Depends On | Acceptance Criteria |
|------|-------------|------------|---------------------|
| 2.1 | [Description] | 1.2 | [Criteria] |

[Continue for all phases]

---
PHASE_3_COMPLETE
---`;

export function buildPlanningOpener(spec: SpecificationContent): string

export function parsePlanningResult(response: string): ImplementationPhase[] | null
// Parse markdown tables into ImplementationPhase[]
```

Write tests in tests/unit/lib/llm/prompts/:
- ideation.test.ts: opener builds correctly, parse extracts all fields
- specification.test.ts: opener includes ideation, parse extracts spec
- planning.test.ts: parse correctly builds task arrays with dependencies
```

**Verification Checklist**:
- [x] Ideation prompt covers all checklist items with PHASE_1_COMPLETE signal
- [x] Spec prompt requests all technical details with PHASE_2_COMPLETE signal
- [x] Planning prompt produces parseable output with PHASE_3_COMPLETE signal
- [x] Openers include previous phase context (planning includes use_cases)
- [x] Parsers extract structured data correctly
- [x] Ready signals detected correctly via isReadySignal() function
- [x] All tests pass

---

## Step 18: LLM Service Layer

**Goal**: Create service coordinating all LLM operations.

```text
Create service layer for LLM operations.

File: src/lib/llm/llm-service.ts

```typescript
import { AnthropicClient } from './anthropic-client';
import { Conversation } from './conversation';
import { IdeationContent, SpecificationContent, ImplementationPhase, TaskResult, Task } from '../../types';

interface LLMServiceConfig {
  apiKey?: string;
  model?: string;
  onCostUpdate?: (totalCost: number) => void;
}

interface PhaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  tokenCount: { input: number; output: number };
  cost: number;
}

export class LLMService {
  private client: AnthropicClient;
  private totalCost: number = 0;
  
  constructor(private config: LLMServiceConfig)
  
  // === Interactive Phases ===
  
  async runIdeationPhase(
    idea: string,
    onAssistantMessage: (message: string) => void,
    getUserInput: () => Promise<string>
  ): Promise<PhaseResult<IdeationContent>>
  
  async runSpecPhase(
    ideation: IdeationContent,
    onAssistantMessage: (message: string) => void,
    getUserInput: () => Promise<string>
  ): Promise<PhaseResult<SpecificationContent>>
  
  async runPlanningPhase(
    spec: SpecificationContent,
    onAssistantMessage: (message: string) => void,
    getUserInput: () => Promise<string>
  ): Promise<PhaseResult<ImplementationPhase[]>>
  
  // === Task Validation ===
  
  async validateTaskResult(
    task: Task,
    result: Partial<TaskResult>,
    codeContext: string
  ): Promise<ValidationResult>
  
  // === Cost Tracking ===
  
  getTotalCost(): number
  
  resetCost(): void
}
```

Implementation:

1. runIdeationPhase():
   ```typescript
   const conversation = new Conversation(this.client, {
     systemPrompt: IDEATION_SYSTEM_PROMPT,
     onToken: (t) => process.stdout.write(t),  // Stream output
   });
   
   // Initial prompt
   let response = await conversation.sendStreaming(buildIdeationOpener(idea));
   onAssistantMessage(response);
   
   // Conversation loop
   while (!isReadySignal(response, 1)) {
     const userInput = await getUserInput();
     if (userInput === '/quit') throw new Error('User cancelled');
     response = await conversation.sendStreaming(userInput);
     onAssistantMessage(response);
   }
   
   // Parse result
   const data = parseIdeationResult(response);
   if (!data) throw new Error('Failed to parse ideation result');
   
   return {
     success: true,
     data,
     tokenCount: conversation.getTokenCounts(),
     cost: conversation.getTotalCost(),
   };
   ```

2. runSpecPhase() and runPlanningPhase() follow same pattern with their respective prompts

3. validateTaskResult():
   - Build validation prompt with task info and result
   - Ask LLM to verify acceptance criteria are met
   - Parse structured response
   - Return ValidationResult

File: src/lib/llm/prompts/validation.ts

```typescript
export const VALIDATION_SYSTEM_PROMPT = `You are a code reviewer verifying task completion.

Check that:
1. All acceptance criteria are met
2. Tests exist and pass
3. Code follows project conventions

Be strict but fair. Output your assessment as JSON:
{
  "passed": boolean,
  "criteria_results": [
    {"criterion": "string", "met": boolean, "notes": "string"}
  ],
  "issues": ["string"],
  "overall_assessment": "string"
}`;

export function buildValidationPrompt(task: Task, result: Partial<TaskResult>, codeContext: string): string
```

Write tests in tests/unit/lib/llm/llm-service.test.ts:
- Test phase runners with mocked conversation
- Test validation prompt building
- Test result parsing
- Test cost tracking
```

**Verification Checklist**:
- [x] Ideation phase uses start/continue/complete methods for flexibility
- [x] Spec phase receives ideation context
- [x] Planning phase produces task arrays
- [x] Validation builds correct prompt
- [x] Cost tracked across all operations via totalCost, getTotalCost(), and onCostUpdate callback
- [x] All tests pass

---

## Manual Checkpoint D

**Before proceeding to Phase E, verify:**

```bash
# 1. Run all tests
npm test

# 2. Test LLM client (requires API key)
cat > test-llm.ts << 'EOF'
import { AnthropicClient } from './src/lib/llm/anthropic-client';

const client = new AnthropicClient();
const result = await client.complete('Say "Hello from Orchestrator" and nothing else.');
console.log('Response:', result.content);
console.log('Tokens:', result.inputTokens, '/', result.outputTokens);
console.log('Cost: $', client.calculateCost(result.inputTokens, result.outputTokens));
EOF

ANTHROPIC_API_KEY=your-key npx tsx test-llm.ts

# 3. Test prompt parsing
# Use test fixtures to verify parsers work
```

**Checkpoint Checklist**:
- [x] All tests pass (~95 tests)
- [x] LLM client connects successfully
- [x] Token counts accurate
- [x] Cost calculation correct
- [x] Prompts produce expected output

---
