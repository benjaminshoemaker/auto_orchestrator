# CLAUDE.md - Agent Context

This file provides context for AI agents working on the **resume_feedback** project.

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

```json
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
```
