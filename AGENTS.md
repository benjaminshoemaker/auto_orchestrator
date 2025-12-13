# AGENTS.md - Orchestrator Project

## Repository docs
- `ONE_PAGER.md` - Captures Problem, Audience, Platform, Core Flow, MVP Features
- `DEV_SPEC.md` - Minimal functional and technical specification consistent with prior docs, including a concise **Definition of Done**
- `PROMPT_PLAN_1.md` - Phase 1 - Agent-Ready Planner with per-step prompts, expected artifacts, tests, rollback notes, idempotency notes, and a TODO checklist using Markdown checkboxes
- `PROMPT_PLAN_2.md` - Phase 2 - Agent-Ready Planner (same format as Phase 1)
- `AGENTS.md` - This file

---

## Project context

### Tech stack
- **Language/Runtime**: TypeScript 5.x on Node.js 20+, ES Modules
- **Test framework**: Vitest (Jest-compatible API)
- **Package manager**: npm
- **CLI framework**: Commander.js + Chalk + Inquirer + Ora
- **LLM**: @anthropic-ai/sdk (Claude Sonnet 4)
- **Execution**: Claude Code CLI (`claude --print`)
- **Git**: simple-git
- **Document parsing**: yaml (for frontmatter)

### File structure conventions
```
src/
├── index.ts              # CLI entry point
├── types/                # Type definitions and error classes
│   ├── index.ts          # All interfaces and types
│   └── errors.ts         # OrchestratorError hierarchy
├── lib/                  # Core library code
│   ├── parsers/          # YAML frontmatter, PROJECT.md parser
│   ├── writers/          # PROJECT.md writer
│   ├── state/            # StateManager, DependencyResolver, PhaseManager
│   ├── llm/              # AnthropicClient, Conversation, prompts/
│   ├── phases/           # PhaseRunner, IdeationPhase, SpecPhase, PlanningPhase
│   ├── execution/        # ClaudeAdapter, TaskExecutor, PhaseExecutor, Orchestrator
│   ├── git/              # GitClient, WorkflowManager
│   ├── ui/               # Terminal utilities
│   ├── documents.ts      # DocumentManager facade
│   ├── claude-md.ts      # CLAUDE.md manager
│   ├── task-results.ts   # TaskResultManager
│   └── pipeline.ts       # Full pipeline coordinator
├── commands/             # CLI command handlers
│   ├── init.ts
│   ├── resume.ts
│   ├── status.ts
│   ├── approve.ts
│   ├── skip.ts
│   ├── retry.ts
│   └── config.ts
└── utils/                # Utilities
    ├── logger.ts
    ├── project.ts        # Project directory helpers
    └── templates.ts      # Initial file templates

tests/
├── unit/                 # Unit tests (mirror src/ structure)
├── integration/          # Multi-component tests
├── e2e/                  # End-to-end tests (require real API)
└── fixtures/             # Test data files
```

### State file conventions
- `PROJECT.md` uses YAML frontmatter (between `---` delimiters) + markdown body
- Task results are JSON in `tasks/results/task-{id}.json`
- CLAUDE.md is plain markdown (template-based)
- When modifying PROJECT.md programmatically:
  - Parse with ProjectParser
  - Modify in memory
  - Write with ProjectWriter
  - **Never** use string replacement for structured updates

---

## Agent responsibility

### Checklist management
- After completing any coding, refactor, or test step, **immediately update the corresponding TODO checklist item** in the relevant `PROMPT_PLAN_*.md` file
- Use Markdown checkbox format (`- [x]`) to mark completion
- Always commit changes to the prompt plan file alongside the code and tests that fulfill them
- Do not consider work "done" until the matching checklist item is checked and all related tests are green

### Completion protocol
When a plan step is finished, document its completion state with a short checklist:
- [ ] Step name & number
- [ ] Test results (all green)
- [ ] PROMPT_PLAN file updated
- [ ] Manual checks performed (human confirmed)
- [ ] Release notes updated (if user-facing change)
- [ ] Inline commit summary for human to copy

### Release notes
- If the step adds or changes **user-facing behavior** (new command, changed output, new config option), update the README "Release notes" section
- Internal refactors and test additions do not require release notes
- State "No user-facing changes" explicitly when applicable

### Manual test suggestion
Even when automated coverage exists, always suggest a feasible manual test path so the human can exercise the feature end-to-end.

---

## Guardrails for agents

### General
- Make the smallest change that passes tests and improves the code
- Do not introduce new public APIs without updating `DEV_SPEC.md` and relevant tests
- Do not duplicate templates or files to work around issues—fix the original
- Respect privacy: do not log secrets, prompts, completions, or PII

### When stuck
- If a file cannot be opened, content is missing, **or a test fails unexpectedly**, say so explicitly and stop
- Do not guess or work around
- If you don't understand why a test is failing, **read the full error output** before attempting fixes—the answer is usually in the stack trace

### Deferred-work notation
- When a task is intentionally paused or skipped, keep its checkbox unchecked and prepend `(Deferred)` to the TODO label, followed by a short reason
- Apply the same `(Deferred)` tag to every downstream checklist item that depends on the paused work
- Remove the tag only after the work resumes

### When the prompt plan is fully satisfied
- Once every Definition of Done task in the `PROMPT_PLAN_*.md` file is either checked off or explicitly marked `(Deferred)`, the plan is considered **complete**
- After that point, you no longer need to update prompt-plan TODOs or reference upstream docs to justify changes
- All other guardrails, testing requirements, and agent responsibilities continue to apply

---

## Testing policy (non-negotiable)

### Core rules
- Tests **MUST** cover the functionality being implemented
- **NEVER** ignore the output of the system or the tests—logs and messages often contain **critical** information
- **NEVER** disable functionality to hide a failure—fix root cause
- **NEVER** claim something is "working" when any functionality is disabled or broken

### Test output policy
- stdout/stderr from tests must be empty unless explicitly testing output behavior
- Use Vitest's `vi.spyOn(console, 'log')` to capture and assert on expected output
- Suppress ora spinners and chalk colors in test environment (check `process.env.CI` or `process.env.VITEST`)
- If a test legitimately produces output, capture it and assert on it—don't let it leak

### What "green tests" means
All of the following must pass:
1. `npm run test` - All Vitest tests pass
2. `npm run typecheck` - No TypeScript errors
3. `npm run lint` - No ESLint errors
4. `npm run build` - Compiles successfully

A step is not complete until all four pass.

### TDD workflow
1. Write a failing test that defines a desired function or improvement
2. Run the test to confirm it fails as expected
3. Write minimal code to make the test pass
4. Run the test to confirm success
5. Refactor while keeping tests green
6. Repeat for each new feature or bugfix

---

## Mocking policy

### Required mocks (no exceptions)
- **NEVER** make real Anthropic API calls in tests—always mock `@anthropic-ai/sdk`
- **NEVER** spawn real `claude` CLI processes in tests—mock `child_process.spawn`
- **ALWAYS** use temp directories for file system tests—clean up in `afterEach`

### Real API tests
Integration tests requiring real API calls must:
- Be skipped when `ANTHROPIC_API_KEY` is not set
- Be excluded from CI by default
- Be documented as manual verification steps
- Be run sparingly (costs money)

### Cost awareness
- Real LLM calls cost money ($3/M input, $15/M output for Sonnet)
- Track actual costs during manual testing and report in completion checklist
- All automated tests MUST use mocks

---

## Error handling

This project uses a typed error hierarchy. All errors must extend `OrchestratorError`:

| Error Class | Use Case |
|-------------|----------|
| `DocumentParseError` | Invalid PROJECT.md or YAML |
| `StateError` | Invalid state transitions |
| `TaskExecutionError` | Task failed to execute |
| `ValidationError` | Sub-agent validation failed |
| `GitError` | Git operation failed |
| `LLMError` | API call failed |

When adding new error cases:
1. Use existing error class if appropriate
2. Create new subclass only if category is genuinely new
3. Always include `code` property for programmatic handling
4. Include relevant context in error message

---

## Async code guidelines

- All file I/O uses `fs/promises`, not sync methods
- LLM calls stream responses; use async generators where appropriate
- Child processes (Claude CLI) use event-based handling with timeouts
- State mutations are synchronous; file persistence is async with dirty-flag batching

---

## Commit messages

Format: `<scope>: <description>`

| Scope | Use |
|-------|-----|
| `feat` | New functionality |
| `fix` | Bug fix |
| `test` | Test additions/changes |
| `refactor` | Code restructuring |
| `docs` | Documentation |
| `chore` | Build/tooling changes |

Examples:
- `feat(cli): add retry command`
- `fix(state): handle missing task results gracefully`
- `test(parser): add round-trip tests for PROJECT.md`

---

## Important checks

- **NEVER** disable functionality to hide a failure—fix root cause
- **NEVER** create duplicate templates or files—fix the original
- **NEVER** claim something is "working" when any functionality is disabled or broken
- If you can't open a file or access something requested, say so—do not assume contents
- **ALWAYS** identify and fix the root cause of template or compilation errors
- If git is initialized, ensure `.gitignore` exists and contains at least:
  ```
  .env
  .env.local
  .env.*
  node_modules/
  dist/
  tasks/prompts/
  ```

---

## Context management between steps

### Starting a new step
When beginning a new PROMPT_PLAN step, **start a fresh conversation**. Do not carry forward conversation history from previous steps.

Before working on any step, ensure you have loaded:
1. `AGENTS.md` (this file - guardrails and conventions)
2. `DEV_SPEC.md` (architecture reference)
3. The current step's section from `PROMPT_PLAN.md` (the actual task)

Read source files and tests on-demand as needed for the specific step. Do not preload the entire codebase.

### Why clear context between steps?
- Each step is self-contained with complete instructions
- Decisions from previous steps exist in the code, not conversation history
- Stale context causes confusion and wastes tokens
- The code and tests are the source of truth

### When to preserve context
**Within a single step**, if tests fail or issues arise, continue in the same conversation to debug. The iteration loop is:

```
Step N starts (fresh context)
    → Implement
    → Test fails
    → Debug (keep context)
    → Fix
    → Test fails again
    → Debug (keep context)
    → Fix
    → Tests pass
    → Step N complete
Step N+1 starts (fresh context)
```

Only clear context when moving to the next step, not while iterating on the current one.

### Resuming work after a break
When returning to a project after stopping:
1. Start a fresh conversation
2. Load AGENTS.md, DEV_SPEC.md
3. Check PROMPT_PLAN checkboxes to find the current step
4. Run tests to verify current state
5. Continue from the first unchecked step

Do not attempt to reconstruct previous conversation context. The checked boxes and passing tests tell you everything you need to know.

---

## When to ask for human input

Ask the human if any of the following is true:
- You need new environment variables or secrets
- An external dependency or major architectural change is required
- A test is failing and you cannot determine why after reading the full error output
- You're unsure whether a change is user-facing (and thus needs release notes)
- Manual verification requires API keys or external services you cannot access
