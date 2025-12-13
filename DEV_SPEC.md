# Technical Specification: Autonomous Development Orchestrator

## Overview

The Orchestrator is a CLI tool that guides software projects from initial idea through complete implementation using a three-phase planning workflow followed by automated task execution via AI coding agents.

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                            CLI Layer                             │
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

### Design Principles

1. **File-based state**: All state lives in human-readable files (PROJECT.md, JSON). No database required.
2. **Resumable execution**: The system can stop and resume at any point without data loss.
3. **Human-in-the-loop**: Phase gates require explicit approval before proceeding.
4. **Sequential simplicity**: Tasks execute one at a time to simplify state management and debugging.
5. **Single source of truth**: PROJECT.md contains all project state and can be manually edited.

---

## Tech Stack

### Runtime & Language

| Choice | Rationale |
|--------|-----------|
| **Node.js 20+** | Modern LTS with native ES modules, excellent async support, ubiquitous in developer tooling |
| **TypeScript 5.x** | Type safety for complex state management, better IDE support, catches errors at compile time |
| **ES Modules** | Modern standard, better tree-shaking, cleaner imports |

### CLI Framework

| Choice | Rationale |
|--------|-----------|
| **Commander.js** | Industry standard for Node CLIs, declarative command definition, built-in help generation, minimal footprint |
| **Chalk** | Terminal colors without complexity, widely used, no dependencies |
| **Inquirer** | Robust interactive prompts, handles edge cases (Ctrl+C, terminal resize), supports multiple input types |
| **Ora** | Clean spinner animations, doesn't interfere with other output |

### LLM Integration

| Choice | Rationale |
|--------|-----------|
| **@anthropic-ai/sdk** | Official SDK, TypeScript types included, handles auth/retries/streaming |
| **Claude Sonnet 4** | Best balance of capability, speed, and cost for interactive phases |
| **Claude Code CLI** | Anthropic's official coding agent, handles file operations and test execution autonomously |

### Document Processing

| Choice | Rationale |
|--------|-----------|
| **yaml** | Parse/serialize YAML frontmatter, handles edge cases, minimal dependencies |
| **Markdown (custom parsing)** | No heavy dependencies, full control over section extraction and table parsing |
| **JSON** | Native to Node, human-readable task results, easy to validate |

### Git Integration

| Choice | Rationale |
|--------|-----------|
| **simple-git** | Wraps git CLI, doesn't require libgit2, works everywhere git works |

### Testing

| Choice | Rationale |
|--------|-----------|
| **Vitest** | Fast, native ESM support, Jest-compatible API, built-in TypeScript support |

### Development Tools

| Choice | Rationale |
|--------|-----------|
| **tsx** | Run TypeScript directly without build step during development |
| **ESLint + TypeScript plugin** | Catch errors and enforce consistency |
| **Prettier** | Consistent formatting without debates |

---

## Data Models

### PROJECT.md Structure

The PROJECT.md file uses YAML frontmatter for machine-readable state and markdown sections for human-readable content.

```yaml
---
version: 1
project_id: "uuid"
project_name: "my-project"
created: "2024-01-15T10:00:00Z"
updated: "2024-01-15T14:30:00Z"
current_phase: 1 | 2 | 3 | "implementation"
current_phase_name: "Idea Refinement"
phase_status: "pending" | "in_progress" | "complete" | "approved"

gates:
  ideation_complete: false
  ideation_approved: false
  ideation_approved_at: null
  spec_complete: false
  spec_approved: false
  spec_approved_at: null
  planning_complete: false
  planning_approved: false
  planning_approved_at: null

implementation:
  total_phases: 3
  completed_phases: 1
  current_impl_phase: 2
  current_impl_phase_name: "Core Features"

cost:
  total_tokens: 150000
  total_cost_usd: 2.45

agent:
  primary: "claude-code"
  timeout_minutes: 10
---
```

### Task Definition

Tasks are defined in markdown tables within PROJECT.md:

```markdown
| Task | Description | Status | Depends On | Acceptance Criteria |
|------|-------------|--------|------------|---------------------|
| 1.1 | Set up project scaffolding | ⏳ | - | Package.json exists; TypeScript configured |
| 1.2 | Create data models | ⏳ | 1.1 | User and Post types defined; Exports work |
```

### Task Result JSON

Each completed task produces a JSON file in `tasks/results/task-{id}.json`:

```typescript
interface TaskResult {
  task_id: string;
  task_description: string;
  status: "success" | "failed";
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  summary: string;
  files_created: string[];
  files_modified: string[];
  files_deleted: string[];
  key_decisions: { decision: string; rationale: string }[];
  assumptions: string[];
  tests_added: number;
  tests_passing: number;
  tests_failing: number;
  acceptance_criteria: { criterion: string; met: boolean; notes?: string }[];
  validation: {
    passed: boolean;
    validator_output: string;
    criteria_checked: number;
    criteria_passed: number;
  };
  tokens_used: number;
  cost_usd: number;
  failure_reason?: string;
  commit_hash?: string;
}
```

---

## Component Design

### State Manager

Coordinates in-memory state with file persistence. Provides:
- Loading PROJECT.md and task results into memory
- Dirty-flag tracking for efficient saves
- Event emission on state changes
- Task lifecycle management (start, complete, fail, skip, retry)
- Cost accumulation

### Dependency Resolver

Handles task ordering using topological sort:
- Validates dependency graph (no cycles, no missing refs)
- Determines which tasks can run based on completed dependencies
- Provides execution order for sequential processing

### Phase Manager

Controls phase transitions:
- Maintains readiness checklists per phase
- Validates approval prerequisites
- Manages implementation phase advancement

### LLM Service

Abstracts all LLM interactions:
- Interactive conversation loops for phases 1-3
- Streaming output for responsive UX
- Sub-agent validation of task completion
- Token and cost tracking

### Task Executor

Executes individual tasks:
1. Builds prompt from CLAUDE.md template + task context + dependency outputs
2. Spawns Claude Code CLI with prompt
3. Parses result JSON from output
4. Runs sub-agent validation
5. Records result and updates state

### Execution Orchestrator

Coordinates multi-phase implementation:
- Runs tasks sequentially within each phase
- Requests approval between implementation phases
- Handles failures (stops execution, shows retry/skip options)
- Tracks cumulative cost

### Git Workflow Manager

Manages version control:
- Creates branch per implementation phase
- Commits after each successful task
- Uses consistent commit message format

---

## Error Handling

### Error Hierarchy

```
OrchestratorError (base)
├── DocumentParseError    - Invalid PROJECT.md or YAML
├── StateError            - Invalid state transition
├── TaskExecutionError    - Task failed to execute
├── ValidationError       - Sub-agent validation failed
├── GitError              - Git operation failed
└── LLMError              - API call failed
```

### Recovery Strategies

| Scenario | Recovery |
|----------|----------|
| Task execution fails | Mark task failed, stop phase, show retry/skip options |
| LLM API error | Wrap in LLMError with request ID, suggest retry |
| Parse error | Show line number and context, allow manual fix |
| Git error | Log warning, continue without commits |
| Timeout | Kill process, mark task failed with timeout reason |

---

## Security Considerations

### API Key Management
- Anthropic API key read from `ANTHROPIC_API_KEY` environment variable
- Never stored in project files
- Never logged or displayed

### File System Access
- Claude Code runs with `--dangerously-skip-permissions` for autonomous operation
- Project directory is working directory; no access outside
- Task prompts written to temporary files, archived after execution

### Input Validation
- YAML frontmatter validated against schema
- Task IDs validated (no path traversal)
- User input sanitized before use in prompts

---

## Performance Considerations

### Token Optimization
- CLAUDE.md template kept concise (~500 tokens)
- Dependency outputs summarized, not full file contents
- Maximum 5 files included in validation context

### Execution Efficiency
- Sequential execution avoids complexity of parallel state management
- Dirty-flag tracking prevents unnecessary file writes
- Task results cached in memory during phase execution

### Timeouts
- Default 10-minute timeout per task
- Configurable via `agent.timeout_minutes`
- Graceful shutdown with SIGTERM, forced with SIGKILL after 5s

---

## Testing Strategy

### Unit Tests (~120 tests)
- Type guards and validators
- Parsers and writers
- State transitions
- Dependency resolution
- Prompt building

### Integration Tests (~40 tests)
- CLI command flows
- Document round-trips
- Git operations
- Multi-component interactions

### E2E Tests (~10 tests)
- Full pipeline with mocked LLM
- Resume from various states
- Error recovery flows

### Manual Testing
- Real LLM interactions
- Performance measurement
- Cost verification

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude |
| `DEBUG` | No | Enable debug logging |

### Project Configuration

Stored in PROJECT.md frontmatter:

| Field | Default | Description |
|-------|---------|-------------|
| `agent.timeout_minutes` | 10 | Max time per task |
| `agent.primary` | "claude-code" | Execution agent |

### Git Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | true | Enable Git integration |
| `auto_commit` | true | Commit after each task |
| `branch_prefix` | "phase-" | Prefix for phase branches |

---

## Future Considerations (v2)

### Parallel Execution
- Multiple agents via Git worktrees
- Task-level parallelism within dependency constraints
- Requires distributed state management

### Multi-Agent Support
- Codex CLI as fallback/alternative
- Agent-specific prompt templates
- Failover logic

### Observability
- Langfuse integration for tracing
- Token usage dashboards
- Cost attribution per phase/task

### Web Interface
- Real-time execution monitoring
- DAG visualization
- Approval workflow UI
