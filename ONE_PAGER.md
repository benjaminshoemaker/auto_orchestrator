# Orchestrator: One-Pager

## What problem does the app solve?

AI coding assistants like Claude Code, Cursor, and GitHub Copilot can write code, but they struggle with larger projects. Without clear specifications and structured plans, these tools produce inconsistent results, miss requirements, and leave projects 80% complete. Developers end up spending more time fixing AI-generated code than they saved.

The core problems:

1. **Vague ideas → poor implementations**: Jumping straight from "I want a todo app" to code produces shallow, incomplete solutions
2. **No project memory**: AI agents don't remember decisions from previous sessions, leading to contradictory implementations
3. **Task scope creep**: Without clear boundaries, AI agents either do too little or spiral into unrelated changes
4. **No verification**: There's no systematic way to confirm the AI actually met requirements
5. **Manual orchestration**: Developers must babysit the AI, copy-pasting context and manually sequencing work

**Orchestrator solves this by providing structure.** It guides you through idea refinement, creates detailed specifications, breaks work into small verified tasks, and executes them autonomously with quality gates at every step.

---

## Who is the ideal user for this app?

**Primary user: Solo developers and small teams building side projects or MVPs**

Characteristics:
- Comfortable with command-line tools
- Already using AI coding assistants but frustrated by their limitations
- Have more ideas than time to implement them
- Want to move fast but don't want to sacrifice quality
- Value working software over perfect architecture

**Secondary user: Technical founders validating product ideas**

Characteristics:
- Can write code but prefer to focus on product/business
- Need to build functional prototypes quickly
- Want to understand what's being built without writing every line
- Appreciate human review checkpoints before committing to implementation

**Not ideal for:**
- Large teams with established processes (too opinionated)
- Non-technical users (requires CLI comfort and code review ability)
- Projects requiring real-time collaboration (single-user workflow)

---

## What platform(s) does it live on?

**Command Line Interface (CLI)**

- Runs locally on macOS, Linux, and Windows (via WSL)
- Requires Node.js 20+ runtime
- Integrates with Claude Code CLI for task execution
- Works within any project directory
- Outputs to human-readable markdown files

**Why CLI?**

1. **Developer-native**: Target users live in terminals
2. **No infrastructure**: No servers, databases, or accounts to manage
3. **Version control friendly**: All state in text files that diff cleanly
4. **Composable**: Fits into existing workflows (can be scripted, piped, etc.)
5. **Offline-capable**: Only needs internet for LLM calls

---

## Describe the core user experience, step-by-step

### 1. Start with an idea

```bash
$ orchestrator init "A recipe manager that suggests meals based on ingredients I have"
```

The user provides a rough idea—can be one sentence or a paragraph.

### 2. Refine through conversation (Phase 1: Ideation)

The orchestrator asks clarifying questions one at a time:

```
🤖 Assistant: What problem does this solve for you personally? Are you trying 
to reduce food waste, save money, or something else?

👤 You: Mostly reduce waste. I always have random ingredients and never know 
what to make with them.

🤖 Assistant: Who else might use this besides you? Would they need accounts, 
or is this a single-user tool?

👤 You: Just me for now. No accounts needed.
```

After 5-10 questions, the assistant produces a structured summary: problem statement, target users, use cases, success criteria, and constraints.

### 3. Review and approve

```bash
$ cat PROJECT.md  # Review the ideation summary
$ orchestrator approve phase-1
```

The user reviews PROJECT.md (which is human-editable) and explicitly approves to continue.

### 4. Generate technical specification (Phase 2)

The orchestrator proposes architecture, tech stack, data models, and API contracts based on the requirements. The user can ask questions or request changes.

```
🤖 Assistant: For a single-user local app, I recommend SQLite for storage and 
a simple Express API. For the ingredient matching, we could use a basic 
keyword search or integrate with a recipe API. Which approach interests you?

👤 You: Let's use a recipe API. I don't want to maintain a recipe database.
```

### 5. Create implementation plan (Phase 3)

The orchestrator breaks the project into phases and tasks:

```
Implementation Phase 1: Foundation
├── Task 1.1: Project scaffolding
├── Task 1.2: Database schema
└── Task 1.3: Basic Express server

Implementation Phase 2: Core Features  
├── Task 2.1: Ingredient input endpoint
├── Task 2.2: Recipe API integration
└── Task 2.3: Matching algorithm
```

Each task has:
- Clear description
- Dependencies on other tasks
- Specific acceptance criteria
- Estimated scope (15-30 minutes of AI work)

### 6. Execute with automation

```bash
$ orchestrator approve phase-3
$ orchestrator resume
```

The orchestrator executes tasks one by one:

```
[1/6] Starting: 1.1 - Project scaffolding
✓ Completed: 1.1 (45s, $0.03)

[2/6] Starting: 1.2 - Database schema
✓ Completed: 1.2 (62s, $0.04)
```

For each task:
1. Claude Code receives the task prompt with full context
2. It writes code, creates tests, runs them
3. A validation agent verifies acceptance criteria are met
4. Results are committed to Git
5. Next task begins

### 7. Handle issues

If a task fails:

```
[4/6] Starting: 2.2 - Recipe API integration
✗ Failed: 2.2 - API key not configured

Options:
  orchestrator retry 2.2  - Fix the issue and retry
  orchestrator skip 2.2 --reason "..."  - Skip if not needed
```

The user can fix the issue (add the API key) and retry, or skip the task if it's not essential.

### 8. Review between phases

After each implementation phase completes, the orchestrator pauses:

```
✓ Phase 1 complete! 3 tasks, $0.11

Approve and continue to Phase 2? (Y/n)
```

This gives the user a chance to review the code, run the app, and decide whether to proceed.

### 9. Completion

```
✓ All implementation phases complete!

Total: 3 phases, 9 tasks
Cost: $0.47
Time: 12 minutes

Your project is ready in ./recipe-manager
```

---

## What are the must-have features for the MVP?

### Core Workflow

| Feature | Description |
|---------|-------------|
| **Three-phase planning** | Ideation → Specification → Implementation Plan, each with interactive LLM conversation |
| **Phase approval gates** | Explicit user approval required before proceeding to next phase |
| **Task breakdown** | Automatic decomposition into small, verifiable tasks with dependencies |
| **Sequential execution** | Tasks run one at a time via Claude Code CLI |
| **Sub-agent validation** | Separate LLM call verifies each task met its acceptance criteria |

### State Management

| Feature | Description |
|---------|-------------|
| **PROJECT.md as source of truth** | All state in one human-readable, editable file |
| **Resume from any point** | Stop and restart without losing progress |
| **Task result logging** | JSON files capture what each task did, decisions made, files changed |

### CLI Commands

| Command | Purpose |
|---------|---------|
| `init <idea>` | Start new project |
| `resume` | Continue from current state |
| `status` | Show project progress, failed tasks, cost |
| `approve <phase>` | Approve a completed phase |
| `skip <task-id>` | Skip a task with reason |
| `retry <task-id>` | Reset failed task and re-run |

### Developer Experience

| Feature | Description |
|---------|-------------|
| **Git integration** | Branch per phase, commit per task, clean history |
| **Cost tracking** | Running total of LLM token costs |
| **Clear failure messages** | When something breaks, show why and how to fix |
| **Streaming output** | See LLM responses as they generate |

### Not in MVP (v2+)

- Parallel task execution
- Web UI / dashboard
- Multi-agent support (Codex, etc.)
- Team collaboration
- Conversation save/resume within phases
- Visual DAG of task dependencies
- Langfuse observability integration

---

## Success Metrics

**For users:**
- Time from idea to working MVP < 1 hour for simple projects
- 80%+ of tasks complete successfully on first attempt
- Total cost < $5 for typical side project

**For the product:**
- User completes at least one full project end-to-end
- User returns to build a second project
- User recommends to another developer
