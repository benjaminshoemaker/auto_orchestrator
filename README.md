# Orchestrator

Autonomous development pipeline that takes an idea through refinement, specification, planning, and implementation.

## Installation

```bash
npm install -g @orchestrator/cli
```

## Prerequisites

- Node.js 20+
- Claude CLI (`npm install -g @anthropic-ai/claude-code`)
- Anthropic API key (`export ANTHROPIC_API_KEY=your-key`)

## Quick Start

```bash
# Start a new project
orchestrator init "A todo list app with categories"

# Answer questions to refine your idea (Phase 1)
# Review PROJECT.md when complete

# Approve and continue
orchestrator approve phase-1
orchestrator resume  # Runs Phase 2

# Continue through all phases
orchestrator approve phase-2
orchestrator resume  # Runs Phase 3
orchestrator approve phase-3
orchestrator resume  # Starts implementation

# Monitor progress
orchestrator status
```

## Commands

### `orchestrator init <idea>`

Start a new project from an idea.

Options:
- `--dir, -d <path>`: Project directory (default: current)
- `--name, -n <n>`: Project name

### `orchestrator resume`

Resume an existing project from current state.

### `orchestrator status`

Show project status.

Options:
- `--json`: Output as JSON

### `orchestrator approve <phase>`

Approve a completed phase.

Arguments:
- `phase`: phase-1, phase-2, phase-3, or impl-N

Options:
- `--notes <text>`: Approval notes

### `orchestrator retry <task-id>`

Retry a failed task by resetting it to pending.

Arguments:
- `task-id`: The task ID (e.g., "2.3")

### `orchestrator skip <task-id>`

Skip a task (for manual completion).

Options:
- `--reason, -r <text>`: Reason (required)

## Project Structure

```
your-project/
├── PROJECT.md       # Master document with all state
├── CLAUDE.md        # Agent context
└── tasks/
    └── results/     # Task result JSON files
```

## Phases

1. **Ideation**: Interactive refinement of your idea
2. **Specification**: Technical architecture and design
3. **Planning**: Break down into implementation phases and tasks
4. **Implementation**: Automated task execution with Claude Code

## Handling Failures

If a task fails during execution:

1. `orchestrator status` shows failed tasks
2. `orchestrator retry <task-id>` resets the task and re-runs
3. `orchestrator skip <task-id> --reason "..."` skips if not needed

## Configuration

Environment variables:
- `ANTHROPIC_API_KEY`: Your Anthropic API key (required)

You can also create a `.env.local` file in your project root:
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run in development
npm run dev -- init "test idea"
```

## License

MIT
