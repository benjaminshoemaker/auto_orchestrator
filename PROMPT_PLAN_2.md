# Implementation Blueprint Part 2: Phases E-H (Steps 19-34)

# Phase E: Interactive Phases (Steps 19-23)

## Step 19: Terminal UI Utilities

**Goal**: Create utilities for interactive terminal interface.

```text
Create terminal UI utilities for interactive phases.

Install: npm install inquirer ora
Install types: npm install -D @types/inquirer

File: src/lib/ui/terminal.ts

```typescript
import inquirer from 'inquirer';
import ora, { Ora } from 'ora';
import chalk from 'chalk';

// === Input ===

export async function prompt(message: string): Promise<string>
// Use inquirer for input
// Allow multi-line (empty line submits)
// Handle Ctrl+C gracefully

export async function confirm(message: string, defaultValue?: boolean): Promise<boolean>
// Yes/no confirmation

export async function select<T>(message: string, choices: { name: string; value: T }[]): Promise<T>
// Single selection from list

// === Output ===

export function printHeader(title: string): void
// Bold, underlined header

export function printSection(title: string, content: string): void
// Section with title and indented content

export function printSuccess(message: string): void
// Green checkmark + message

export function printError(message: string): void
// Red X + message

export function printWarning(message: string): void
// Yellow warning + message

export function printInfo(message: string): void
// Blue info + message

// === Progress ===

export function createSpinner(text: string): Ora
// Create ora spinner

export function printProgress(current: number, total: number, label?: string): void
// Progress bar: [████░░░░░░] 40% label

// === Streaming ===

export function streamToken(token: string): void
// Write token without newline (for LLM streaming)
// Use process.stdout.write

export function endStream(): void
// End streaming line (add newline)

// === Conversation Display ===

export function printAssistantMessage(message: string): void
// Format: 🤖 Assistant:
// Then message with proper wrapping

export function printUserPrompt(): string
// Format: 👤 You:
// Return the prompt string for inquirer

// === Formatting ===

export function formatCost(usd: number): string
// Format: $1.23

export function formatDuration(seconds: number): string
// Format: 2m 30s or 45s

export function formatTaskStatus(status: TaskStatus): string
// Return colored status with emoji
```

Implementation notes:

1. prompt() should handle multi-line gracefully:
   ```typescript
   const { input } = await inquirer.prompt([{
     type: 'editor', // Opens editor for multi-line
     name: 'input',
     message: message,
   }]);
   // Or use 'input' type for single line
   ```

2. streamToken() buffers for smoother display

3. All output functions use chalk for colors

Write tests in tests/unit/lib/ui/terminal.test.ts:
- Test formatCost with various values
- Test formatDuration with seconds and minutes
- Test formatTaskStatus for each status
- Mock inquirer for input tests
```

**Verification Checklist**:
- [ ] prompt() accepts input correctly
- [ ] confirm() returns boolean
- [ ] Spinner shows and hides
- [ ] Streaming output smooth
- [ ] Colors display correctly
- [ ] All tests pass

---

## Step 20: Phase Runner Framework

**Goal**: Create framework for running interactive phases.

```text
Create phase runner framework.

File: src/lib/phases/phase-runner.ts

```typescript
import { LLMService } from '../llm/llm-service';
import { StateManager } from '../state/state-manager';
import { DocumentManager } from '../documents';
import * as terminal from '../ui/terminal';

interface PhaseRunnerConfig {
  llmService: LLMService;
  stateManager: StateManager;
  documentManager: DocumentManager;
}

interface PhaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cost: number;
}

export abstract class PhaseRunner<TInput, TOutput> {
  constructor(protected config: PhaseRunnerConfig) {}
  
  async run(input: TInput): Promise<PhaseResult<TOutput>> {
    try {
      this.showHeader();
      await this.setup(input);
      const result = await this.execute(input);
      await this.persist(result);
      this.showSuccess();
      return { success: true, data: result, cost: this.getCost() };
    } catch (error) {
      this.showError(error);
      return { success: false, error: error.message, cost: this.getCost() };
    }
  }
  
  // Implement in subclasses
  protected abstract getPhaseNumber(): number;
  protected abstract getPhaseName(): string;
  protected abstract setup(input: TInput): Promise<void>;
  protected abstract execute(input: TInput): Promise<TOutput>;
  protected abstract persist(result: TOutput): Promise<void>;
  protected abstract getCost(): number;
  
  // Common helpers
  protected showHeader(): void {
    terminal.printHeader(`Phase ${this.getPhaseNumber()}: ${this.getPhaseName()}`);
  }
  
  protected showSuccess(): void {
    terminal.printSuccess(`Phase ${this.getPhaseNumber()} complete!`);
    terminal.printInfo('Run "orchestrator approve phase-' + this.getPhaseNumber() + '" to continue.');
  }
  
  protected showError(error: Error): void {
    terminal.printError(`Phase ${this.getPhaseNumber()} failed: ${error.message}`);
  }
  
  // User interaction helpers
  protected async getAssistantMessage(message: string): Promise<void> {
    terminal.endStream();  // End any previous streaming
    console.log();  // Blank line
    terminal.printAssistantMessage(message);
  }
  
  protected async getUserInput(): Promise<string> {
    console.log();
    return terminal.prompt(terminal.printUserPrompt());
  }
}
```

Write tests in tests/unit/lib/phases/phase-runner.test.ts:
- Test run() calls lifecycle methods in order
- Test error handling wraps errors
- Test cost is returned
```

**Verification Checklist**:
- [ ] run() calls methods in correct order
- [ ] Errors caught and wrapped
- [ ] Header and success messages shown
- [ ] Cost tracked and returned
- [ ] All tests pass

---

## Step 21: Ideation Phase Implementation

**Goal**: Implement Phase 1 interactive flow.

```text
Implement Phase 1: Idea Refinement.

File: src/lib/phases/ideation-phase.ts

```typescript
import { PhaseRunner } from './phase-runner';
import { IdeationContent } from '../../types';
import * as terminal from '../ui/terminal';

interface IdeationInput {
  idea: string;
}

export class IdeationPhase extends PhaseRunner<IdeationInput, IdeationContent> {
  private cost: number = 0;
  
  protected getPhaseNumber(): number { return 1; }
  protected getPhaseName(): string { return 'Idea Refinement'; }
  
  protected async setup(input: IdeationInput): Promise<void> {
    terminal.printSection('Your Idea', input.idea);
    terminal.printInfo('I\'ll ask questions to understand your idea better.');
    terminal.printInfo('Type /quit to cancel at any time.');
    console.log();
  }
  
  protected async execute(input: IdeationInput): Promise<IdeationContent> {
    const result = await this.config.llmService.runIdeationPhase(
      input.idea,
      (message) => this.getAssistantMessage(message),
      () => this.getUserInput()
    );
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to complete ideation');
    }
    
    this.cost = result.cost;
    return result.data;
  }
  
  protected async persist(result: IdeationContent): Promise<void> {
    // Update state with ideation content
    this.config.stateManager.setIdeationContent(result);
    
    // Update meta to mark phase complete
    const meta = this.config.stateManager.getMeta();
    this.config.stateManager.updateMeta({
      ...meta,
      current_phase: 1,
      phase_status: 'complete',
      gates: {
        ...meta.gates,
        ideation_complete: true,
      },
    });
    
    // Add cost
    this.config.stateManager.addCost(0, this.cost);
    
    // Save to disk
    await this.config.stateManager.save();
    
    // Show summary
    terminal.printSection('Summary', this.formatSummary(result));
  }
  
  protected getCost(): number {
    return this.cost;
  }
  
  private formatSummary(result: IdeationContent): string {
    return `
Problem: ${result.problem_statement.substring(0, 100)}...
Users: ${result.target_users.substring(0, 100)}...
Use Cases: ${result.use_cases.length} defined
Success Criteria: ${result.success_criteria.length} defined
    `.trim();
  }
}
```

Write tests in tests/unit/lib/phases/ideation-phase.test.ts:
- Test with mocked LLM service
- Test conversation flow
- Test result persisted to state
- Test cost tracked
- Test error handling
```

**Verification Checklist**:
- [ ] Phase header displays
- [ ] Conversation loop runs
- [ ] Result parsed and stored
- [ ] State updated correctly
- [ ] Cost tracked
- [ ] All tests pass

---

## Step 22: Spec and Planning Phase Implementations

**Goal**: Implement Phase 2 and Phase 3.

```text
Implement Phase 2: Specification and Phase 3: Planning.

File: src/lib/phases/spec-phase.ts

```typescript
import { PhaseRunner } from './phase-runner';
import { IdeationContent, SpecificationContent } from '../../types';
import * as terminal from '../ui/terminal';

interface SpecInput {
  ideation: IdeationContent;
}

export class SpecPhase extends PhaseRunner<SpecInput, SpecificationContent> {
  private cost: number = 0;
  
  protected getPhaseNumber(): number { return 2; }
  protected getPhaseName(): string { return 'Specification'; }
  
  protected async setup(input: SpecInput): Promise<void> {
    terminal.printSection('From Phase 1', this.summarizeIdeation(input.ideation));
    terminal.printInfo('Creating technical specification...');
    console.log();
  }
  
  protected async execute(input: SpecInput): Promise<SpecificationContent> {
    const result = await this.config.llmService.runSpecPhase(
      input.ideation,
      (message) => this.getAssistantMessage(message),
      () => this.getUserInput()
    );
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to complete specification');
    }
    
    this.cost = result.cost;
    return result.data;
  }
  
  protected async persist(result: SpecificationContent): Promise<void> {
    this.config.stateManager.setSpecificationContent(result);
    
    const meta = this.config.stateManager.getMeta();
    this.config.stateManager.updateMeta({
      ...meta,
      current_phase: 2,
      phase_status: 'complete',
      gates: {
        ...meta.gates,
        spec_complete: true,
      },
    });
    
    this.config.stateManager.addCost(0, this.cost);
    await this.config.stateManager.save();
    
    terminal.printSection('Tech Stack', this.formatTechStack(result));
  }
  
  protected getCost(): number { return this.cost; }
  
  private summarizeIdeation(ideation: IdeationContent): string {
    return `${ideation.problem_statement.substring(0, 200)}...`;
  }
  
  private formatTechStack(spec: SpecificationContent): string {
    return spec.tech_stack.map(t => `${t.layer}: ${t.choice}`).join('\n');
  }
}
```

File: src/lib/phases/planning-phase.ts

```typescript
import { PhaseRunner } from './phase-runner';
import { SpecificationContent, ImplementationPhase } from '../../types';
import { DependencyResolver } from '../state/dependency-resolver';
import * as terminal from '../ui/terminal';

interface PlanningInput {
  specification: SpecificationContent;
}

export class PlanningPhase extends PhaseRunner<PlanningInput, ImplementationPhase[]> {
  private cost: number = 0;
  
  protected getPhaseNumber(): number { return 3; }
  protected getPhaseName(): string { return 'Implementation Planning'; }
  
  protected async setup(input: PlanningInput): Promise<void> {
    terminal.printSection('Architecture', input.specification.architecture);
    terminal.printInfo('Creating implementation plan...');
    console.log();
  }
  
  protected async execute(input: PlanningInput): Promise<ImplementationPhase[]> {
    const result = await this.config.llmService.runPlanningPhase(
      input.specification,
      (message) => this.getAssistantMessage(message),
      () => this.getUserInput()
    );
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to complete planning');
    }
    
    // Validate dependencies
    const allTasks = result.data.flatMap(p => p.tasks);
    const resolver = new DependencyResolver(allTasks);
    const validation = resolver.validate();
    
    if (!validation.valid) {
      terminal.printWarning('Dependency issues found:');
      validation.issues.forEach(issue => {
        terminal.printWarning(`  ${issue.taskId}: ${issue.details}`);
      });
      // Continue anyway, but warn
    }
    
    this.cost = result.cost;
    return result.data;
  }
  
  protected async persist(result: ImplementationPhase[]): Promise<void> {
    // Add implementation phases to state
    this.config.stateManager.addImplementationPhases(result);
    
    const meta = this.config.stateManager.getMeta();
    this.config.stateManager.updateMeta({
      ...meta,
      current_phase: 3,
      phase_status: 'complete',
      gates: {
        ...meta.gates,
        planning_complete: true,
      },
      implementation: {
        total_phases: result.length,
        completed_phases: 0,
        current_impl_phase: 1,
        current_impl_phase_name: result[0]?.name || 'Setup',
      },
    });
    
    this.config.stateManager.addCost(0, this.cost);
    await this.config.stateManager.save();
    
    // Show summary
    this.showPlanSummary(result);
  }
  
  protected getCost(): number { return this.cost; }
  
  private showPlanSummary(phases: ImplementationPhase[]): void {
    terminal.printSection('Implementation Plan', '');
    phases.forEach(phase => {
      console.log(`  Phase ${phase.phase_number}: ${phase.name} (${phase.tasks.length} tasks)`);
    });
    const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
    console.log(`\n  Total: ${phases.length} phases, ${totalTasks} tasks`);
  }
}
```

Write tests for both:
- tests/unit/lib/phases/spec-phase.test.ts
- tests/unit/lib/phases/planning-phase.test.ts
```

**Verification Checklist**:
- [ ] Spec phase receives ideation context
- [ ] Planning phase produces phases with tasks
- [ ] Dependencies validated
- [ ] State updated correctly for both
- [ ] Summaries display nicely
- [ ] All tests pass

---

## Step 23: Wire Phases to CLI

**Goal**: Connect phase runners to CLI commands.

```text
Wire interactive phases to init, resume, approve, and retry commands.

File: src/commands/init.ts (update)

```typescript
import { initProjectDir, getProjectPaths, findProjectRoot } from '../utils/project';
import { slugify } from '../utils/templates';
import { DocumentManager } from '../lib/documents';
import { StateManager } from '../lib/state/state-manager';
import { LLMService } from '../lib/llm/llm-service';
import { IdeationPhase } from '../lib/phases/ideation-phase';
import { logger } from '../utils/logger';
import * as terminal from '../lib/ui/terminal';

interface InitOptions {
  dir?: string;
  name?: string;
}

export async function initCommand(idea: string, options: InitOptions): Promise<void> {
  const projectDir = path.resolve(options.dir || process.cwd());
  const projectName = options.name || slugify(idea);
  
  // Initialize project structure
  logger.info(`Initializing project: ${projectName}`);
  await initProjectDir(projectDir, projectName);
  logger.success('Project structure created');
  
  // Set up services
  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();
  
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    terminal.printError('ANTHROPIC_API_KEY environment variable not set');
    terminal.printInfo('Set it with: export ANTHROPIC_API_KEY=your-key');
    process.exit(1);
  }
  
  const llmService = new LLMService({});
  
  // Run Phase 1
  const ideationPhase = new IdeationPhase({
    llmService,
    stateManager,
    documentManager,
  });
  
  const result = await ideationPhase.run({ idea });
  
  if (!result.success) {
    terminal.printError('Phase 1 failed. Project created but incomplete.');
    terminal.printInfo('Run "orchestrator resume" to try again.');
    process.exit(1);
  }
  
  terminal.printInfo(`Cost so far: ${terminal.formatCost(result.cost)}`);
  terminal.printInfo('');
  terminal.printInfo('Next: Review PROJECT.md, then run:');
  terminal.printInfo('  orchestrator approve phase-1');
}
```

File: src/commands/resume.ts (update)

```typescript
import { findProjectRoot, getProjectPaths } from '../utils/project';
import { DocumentManager } from '../lib/documents';
import { StateManager } from '../lib/state/state-manager';
import { PhaseManager } from '../lib/state/phase-manager';
import { LLMService } from '../lib/llm/llm-service';
import { IdeationPhase } from '../lib/phases/ideation-phase';
import { SpecPhase } from '../lib/phases/spec-phase';
import { PlanningPhase } from '../lib/phases/planning-phase';
import { logger } from '../utils/logger';
import * as terminal from '../lib/ui/terminal';

interface ResumeOptions {
  dir?: string;
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  const projectDir = findProjectRoot(options.dir);
  if (!projectDir) {
    terminal.printError('Not in an orchestrator project.');
    process.exit(1);
  }
  
  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();
  
  const phaseManager = new PhaseManager(stateManager);
  const meta = stateManager.getMeta();
  const llmService = new LLMService({});
  
  const config = { llmService, stateManager, documentManager };
  
  // Check for failed tasks that need attention
  const failedTasks = stateManager.getFailedTasks();
  if (failedTasks.length > 0) {
    terminal.printWarning(`${failedTasks.length} failed task(s) found:`);
    failedTasks.forEach(t => {
      terminal.printWarning(`  ${t.id}: ${t.description}`);
      if (t.failure_reason) {
        terminal.printWarning(`    Reason: ${t.failure_reason}`);
      }
    });
    terminal.printInfo('');
    terminal.printInfo('Options:');
    terminal.printInfo('  orchestrator retry <task-id>  - Retry a failed task');
    terminal.printInfo('  orchestrator skip <task-id> --reason "..."  - Skip a task');
    return;
  }
  
  // Phase 1 not complete?
  if (!meta.gates.ideation_complete) {
    terminal.printInfo('Resuming Phase 1: Idea Refinement');
    const doc = stateManager.getProject();
    const idea = doc.meta.project_name;
    
    const result = await new IdeationPhase(config).run({ idea });
    if (!result.success) process.exit(1);
    
    terminal.printInfo('Run: orchestrator approve phase-1');
    return;
  }
  
  // Phase 1 not approved?
  if (!meta.gates.ideation_approved) {
    terminal.printInfo('Phase 1 complete but not approved.');
    terminal.printInfo('Review PROJECT.md, then run: orchestrator approve phase-1');
    return;
  }
  
  // Phase 2 not complete?
  if (!meta.gates.spec_complete) {
    terminal.printInfo('Running Phase 2: Specification');
    const doc = stateManager.getProject();
    if (!doc.ideation) {
      terminal.printError('Ideation content missing. Cannot proceed.');
      process.exit(1);
    }
    
    const result = await new SpecPhase(config).run({ ideation: doc.ideation });
    if (!result.success) process.exit(1);
    
    terminal.printInfo('Run: orchestrator approve phase-2');
    return;
  }
  
  // Phase 2 not approved?
  if (!meta.gates.spec_approved) {
    terminal.printInfo('Phase 2 complete but not approved.');
    terminal.printInfo('Run: orchestrator approve phase-2');
    return;
  }
  
  // Phase 3 not complete?
  if (!meta.gates.planning_complete) {
    terminal.printInfo('Running Phase 3: Implementation Planning');
    const doc = stateManager.getProject();
    if (!doc.specification) {
      terminal.printError('Specification content missing. Cannot proceed.');
      process.exit(1);
    }
    
    const result = await new PlanningPhase(config).run({ specification: doc.specification });
    if (!result.success) process.exit(1);
    
    terminal.printInfo('Run: orchestrator approve phase-3');
    return;
  }
  
  // Phase 3 not approved?
  if (!meta.gates.planning_approved) {
    terminal.printInfo('Phase 3 complete but not approved.');
    terminal.printInfo('Run: orchestrator approve phase-3');
    return;
  }
  
  // All planning approved - proceed to implementation
  terminal.printInfo('All planning phases approved. Starting implementation...');
  // (Implementation execution in Phase F)
}
```

File: src/commands/approve.ts (update)

```typescript
import { findProjectRoot } from '../utils/project';
import { DocumentManager } from '../lib/documents';
import { StateManager } from '../lib/state/state-manager';
import { PhaseManager } from '../lib/state/phase-manager';
import * as terminal from '../lib/ui/terminal';

interface ApproveOptions {
  dir?: string;
  notes?: string;
}

export async function approveCommand(phase: string, options: ApproveOptions): Promise<void> {
  const projectDir = findProjectRoot(options.dir);
  if (!projectDir) {
    terminal.printError('Not in an orchestrator project.');
    process.exit(1);
  }
  
  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();
  
  const phaseManager = new PhaseManager(stateManager);
  
  // Parse phase argument
  const phaseNum = parsePhaseArg(phase);
  if (!phaseNum) {
    terminal.printError(`Invalid phase: ${phase}. Use phase-1, phase-2, phase-3, or impl-N`);
    process.exit(1);
  }
  
  // Check readiness
  const readiness = phaseManager.getReadinessForApproval(phaseNum);
  if (!readiness.ready) {
    terminal.printError(`Phase ${phase} is not ready for approval:`);
    readiness.blockers.forEach(b => terminal.printWarning(`  - ${b}`));
    process.exit(1);
  }
  
  // Approve
  stateManager.approvePhase(phase, options.notes);
  await stateManager.save();
  
  terminal.printSuccess(`Phase ${phase} approved!`);
  terminal.printInfo('Run "orchestrator resume" to continue.');
}

function parsePhaseArg(phase: string): number | string | null {
  if (phase === 'phase-1' || phase === '1') return 1;
  if (phase === 'phase-2' || phase === '2') return 2;
  if (phase === 'phase-3' || phase === '3') return 3;
  const implMatch = phase.match(/^impl-(\d+)$/);
  if (implMatch) return `impl-${implMatch[1]}`;
  return null;
}
```

File: src/commands/retry.ts (update)

```typescript
import { findProjectRoot } from '../utils/project';
import { DocumentManager } from '../lib/documents';
import { StateManager } from '../lib/state/state-manager';
import * as terminal from '../lib/ui/terminal';

interface RetryOptions {
  dir?: string;
}

export async function retryCommand(taskId: string, options: RetryOptions): Promise<void> {
  const projectDir = findProjectRoot(options.dir);
  if (!projectDir) {
    terminal.printError('Not in an orchestrator project.');
    process.exit(1);
  }
  
  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();
  
  // Find the task
  const task = stateManager.getTask(taskId);
  if (!task) {
    terminal.printError(`Task ${taskId} not found.`);
    process.exit(1);
  }
  
  // Check task is failed
  if (task.status !== 'failed') {
    terminal.printError(`Task ${taskId} is not in failed status (current: ${task.status}).`);
    terminal.printInfo('Only failed tasks can be retried.');
    process.exit(1);
  }
  
  // Show task info
  terminal.printSection(`Task ${taskId}`, task.description);
  if (task.failure_reason) {
    terminal.printWarning(`Previous failure: ${task.failure_reason}`);
  }
  
  // Confirm retry
  const confirmed = await terminal.confirm('Reset this task to pending and retry?', true);
  if (!confirmed) {
    terminal.printInfo('Retry cancelled.');
    return;
  }
  
  // Reset task to pending
  stateManager.retryTask(taskId);
  await stateManager.save();
  
  terminal.printSuccess(`Task ${taskId} reset to pending.`);
  terminal.printInfo('Run "orchestrator resume" to continue execution.');
}
```

Write integration tests:
- tests/integration/commands/init-flow.test.ts
- tests/integration/commands/resume-flow.test.ts
- tests/integration/commands/approve-flow.test.ts
- tests/integration/commands/retry-flow.test.ts
```

**Verification Checklist**:
- [ ] init creates project and runs Phase 1
- [ ] resume detects current state correctly
- [ ] resume shows failed tasks if any exist
- [ ] resume runs appropriate phase
- [ ] approve validates readiness
- [ ] approve updates state
- [ ] retry resets failed task to pending
- [ ] retry refuses non-failed tasks
- [ ] All tests pass

---

## Manual Checkpoint E

**Before proceeding to Phase F, verify end-to-end interactive flow:**

```bash
# 1. Run all tests
npm test

# 2. Test full interactive flow (requires API key)
export ANTHROPIC_API_KEY=your-key

mkdir /tmp/interactive-test && cd /tmp/interactive-test
orchestrator init "A simple todo list with categories"

# 3. Answer 4-5 questions in Phase 1
# Wait for PHASE_1_COMPLETE

# 4. Approve and continue
orchestrator approve phase-1
orchestrator resume  # Runs Phase 2

# 5. Complete Phase 2
orchestrator approve phase-2
orchestrator resume  # Runs Phase 3

# 6. Verify PROJECT.md has:
# - Ideation content
# - Specification content
# - Implementation phases with tasks
cat PROJECT.md

# 7. Clean up
rm -rf /tmp/interactive-test
```

**Checkpoint Checklist**:
- [ ] All tests pass (~115 tests)
- [ ] Phase 1 conversation works
- [ ] Phase 2 receives Phase 1 context
- [ ] Phase 3 produces task tables
- [ ] Approvals gate progression
- [ ] PROJECT.md updated after each phase
- [ ] Retry command works on failed tasks

---

# Phase F: Execution Engine (Steps 24-29)

## Step 24: Claude Code Adapter

**Goal**: Create adapter for Claude Code CLI.

```text
Create adapter for spawning Claude Code CLI.

File: src/lib/execution/claude-adapter.ts

```typescript
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ClaudeAdapterConfig {
  workingDir: string;
  timeoutMs: number;
  dangerouslySkipPermissions: boolean;
}

interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}

export class ClaudeAdapter {
  private process: ChildProcess | null = null;
  
  constructor(private config: ClaudeAdapterConfig) {}
  
  // Check if claude CLI is available
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.runCommand('claude', ['--version']);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
  
  // Get claude CLI version
  async getVersion(): Promise<string> {
    const result = await this.runCommand('claude', ['--version']);
    return result.stdout.trim();
  }
  
  // Execute prompt directly
  async execute(prompt: string): Promise<ExecutionResult> {
    const args = ['--print'];
    if (this.config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }
    
    return this.runCommand('claude', args, prompt);
  }
  
  // Execute prompt from file (better for long prompts)
  async executeFromFile(promptPath: string): Promise<ExecutionResult> {
    const prompt = await fs.readFile(promptPath, 'utf-8');
    return this.execute(prompt);
  }
  
  // Execute with streaming output
  async executeStreaming(
    prompt: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void
  ): Promise<ExecutionResult> {
    const args = ['--print'];
    if (this.config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }
    
    return this.runCommandStreaming('claude', args, prompt, onStdout, onStderr);
  }
  
  // Kill running process
  kill(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }
  
  private async runCommand(
    command: string, 
    args: string[], 
    stdin?: string
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      this.process = spawn(command, args, {
        cwd: this.config.workingDir,
        shell: true,
      });
      
      const timeout = setTimeout(() => {
        timedOut = true;
        this.kill();
      }, this.config.timeoutMs);
      
      this.process.stdout?.on('data', (data) => { stdout += data.toString(); });
      this.process.stderr?.on('data', (data) => { stderr += data.toString(); });
      
      if (stdin) {
        this.process.stdin?.write(stdin);
        this.process.stdin?.end();
      }
      
      this.process.on('close', (code) => {
        clearTimeout(timeout);
        this.process = null;
        resolve({
          success: code === 0 && !timedOut,
          stdout,
          stderr,
          exitCode: code || 0,
          timedOut,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }
  
  private async runCommandStreaming(
    command: string,
    args: string[],
    stdin: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void
  ): Promise<ExecutionResult> {
    // Similar to runCommand but calls callbacks
    // Implementation similar, with stdout.on('data', chunk => onStdout(chunk))
  }
}
```

Write tests in tests/unit/lib/execution/claude-adapter.test.ts:
- Mock child_process.spawn
- Test execute sends prompt via stdin
- Test timeout kills process
- Test streaming calls callbacks
- Test kill stops process
```

**Verification Checklist**:
- [ ] isAvailable() detects claude CLI
- [ ] execute() sends prompt, captures output
- [ ] Timeout kills process
- [ ] Streaming calls callbacks
- [ ] kill() stops running process
- [ ] All tests pass

---

## Step 25: Task Prompt Builder

**Goal**: Build complete prompts for task execution.

```text
Create task prompt builder.

File: src/lib/execution/prompt-builder.ts

```typescript
import { Task, ImplementationPhase, TaskResult } from '../../types';
import { ClaudeMdManager } from '../claude-md';
import { TaskResultManager } from '../task-results';

interface PromptBuilderConfig {
  claudeMd: ClaudeMdManager;
  taskResults: TaskResultManager;
  projectDir: string;
}

interface TaskPrompt {
  taskId: string;
  content: string;
  outputPath: string;
}

export class TaskPromptBuilder {
  constructor(private config: PromptBuilderConfig) {}
  
  async build(task: Task, phase: ImplementationPhase): Promise<TaskPrompt> {
    // Get dependency results
    const depResults: TaskResult[] = [];
    for (const depId of task.depends_on) {
      const result = await this.config.taskResults.readResult(depId);
      if (result) depResults.push(result);
    }
    
    // Build full context using CLAUDE.md manager
    const content = await this.config.claudeMd.buildTaskContext({
      task,
      phase,
      dependencyResults: depResults,
    });
    
    return {
      taskId: task.id,
      content,
      outputPath: this.config.taskResults.getResultPath(task.id),
    };
  }
  
  async writePromptFile(prompt: TaskPrompt): Promise<string> {
    const promptDir = path.join(this.config.projectDir, 'tasks', 'prompts');
    await fs.mkdir(promptDir, { recursive: true });
    
    const promptPath = path.join(promptDir, `task-${prompt.taskId}.md`);
    await fs.writeFile(promptPath, prompt.content);
    
    return promptPath;
  }
}
```

Write tests in tests/unit/lib/execution/prompt-builder.test.ts:
- Build prompt with no dependencies
- Build prompt with dependencies
- Prompt includes acceptance criteria
- Prompt includes output path
- writePromptFile creates file
```

**Verification Checklist**:
- [ ] Builds complete prompt
- [ ] Includes dependency outputs
- [ ] Acceptance criteria included
- [ ] Output path correct
- [ ] File writing works
- [ ] All tests pass

---

## Step 26: Task Result Parser

**Goal**: Parse and validate task results.

```text
Create task result parser.

File: src/lib/execution/result-parser.ts

```typescript
import { TaskResult } from '../../types';
import { isValidTaskResult } from '../task-results';

interface ParseResult {
  success: boolean;
  result?: TaskResult;
  errors?: string[];
}

export class TaskResultParser {
  // Parse JSON string into TaskResult
  parse(json: string): ParseResult {
    try {
      const obj = JSON.parse(json);
      const validation = this.validate(obj);
      
      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }
      
      return { success: true, result: obj as TaskResult };
    } catch (err) {
      return { success: false, errors: [`Invalid JSON: ${err.message}`] };
    }
  }
  
  // Parse from file
  async parseFile(filePath: string): Promise<ParseResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { success: false, errors: ['Result file not found'] };
      }
      return { success: false, errors: [`File read error: ${err.message}`] };
    }
  }
  
  // Validate TaskResult structure
  validate(obj: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!obj || typeof obj !== 'object') {
      return { valid: false, errors: ['Result must be an object'] };
    }
    
    const r = obj as Record<string, unknown>;
    
    // Required fields
    if (typeof r.task_id !== 'string') errors.push('task_id must be string');
    if (typeof r.status !== 'string') errors.push('status must be string');
    if (!['success', 'failed'].includes(r.status as string)) {
      errors.push('status must be "success" or "failed"');
    }
    if (typeof r.summary !== 'string') errors.push('summary must be string');
    if (!Array.isArray(r.files_created)) errors.push('files_created must be array');
    if (!Array.isArray(r.acceptance_criteria)) errors.push('acceptance_criteria must be array');
    
    // Validate acceptance criteria structure
    if (Array.isArray(r.acceptance_criteria)) {
      r.acceptance_criteria.forEach((ac, i) => {
        if (typeof ac !== 'object') {
          errors.push(`acceptance_criteria[${i}] must be object`);
        } else {
          if (typeof (ac as any).criterion !== 'string') {
            errors.push(`acceptance_criteria[${i}].criterion must be string`);
          }
          if (typeof (ac as any).met !== 'boolean') {
            errors.push(`acceptance_criteria[${i}].met must be boolean`);
          }
        }
      });
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  // Try to extract partial result from malformed output
  extractPartial(output: string): Partial<TaskResult> {
    const partial: Partial<TaskResult> = {};
    
    // Try to find JSON in output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        if (obj.task_id) partial.task_id = obj.task_id;
        if (obj.summary) partial.summary = obj.summary;
        if (obj.status) partial.status = obj.status;
        if (obj.files_created) partial.files_created = obj.files_created;
      } catch {}
    }
    
    return partial;
  }
}
```

Write tests in tests/unit/lib/execution/result-parser.test.ts:
- Parse valid JSON
- Parse invalid JSON returns errors
- Validate catches missing fields
- Validate checks acceptance criteria structure
- extractPartial finds embedded JSON
```

**Verification Checklist**:
- [ ] Parses valid JSON
- [ ] Returns clear errors for invalid
- [ ] Validates all required fields
- [ ] extractPartial recovers data
- [ ] All tests pass

---

## Step 27: Task Executor with Validation

**Goal**: Execute single task with sub-agent validation.

```text
Create task executor with sub-agent validation.

File: src/lib/execution/task-executor.ts

```typescript
import { Task, ImplementationPhase, TaskResult } from '../../types';
import { ClaudeAdapter } from './claude-adapter';
import { TaskPromptBuilder } from './prompt-builder';
import { TaskResultParser } from './result-parser';
import { LLMService } from '../llm/llm-service';
import { createTaskResult } from '../task-results';
import * as terminal from '../ui/terminal';

interface TaskExecutorConfig {
  claudeAdapter: ClaudeAdapter;
  promptBuilder: TaskPromptBuilder;
  resultParser: TaskResultParser;
  llmService: LLMService;
  projectDir: string;
}

type ProgressCallback = (event: TaskProgressEvent) => void;

type TaskProgressEvent =
  | { type: 'started'; taskId: string }
  | { type: 'executing'; taskId: string }
  | { type: 'parsing_result'; taskId: string }
  | { type: 'validating'; taskId: string }
  | { type: 'complete'; taskId: string; result: TaskResult }
  | { type: 'failed'; taskId: string; reason: string };

export class TaskExecutor {
  constructor(private config: TaskExecutorConfig) {}
  
  async execute(
    task: Task, 
    phase: ImplementationPhase,
    onProgress?: ProgressCallback
  ): Promise<TaskResult> {
    const startTime = new Date().toISOString();
    onProgress?.({ type: 'started', taskId: task.id });
    
    try {
      // 1. Build prompt
      const prompt = await this.config.promptBuilder.build(task, phase);
      const promptPath = await this.config.promptBuilder.writePromptFile(prompt);
      
      // 2. Execute Claude Code
      onProgress?.({ type: 'executing', taskId: task.id });
      const execution = await this.config.claudeAdapter.executeFromFile(promptPath);
      
      if (!execution.success) {
        return this.createFailedResult(task, startTime, 
          execution.timedOut ? 'Execution timed out' : `Exit code: ${execution.exitCode}`
        );
      }
      
      // 3. Parse result
      onProgress?.({ type: 'parsing_result', taskId: task.id });
      const parseResult = await this.config.resultParser.parseFile(prompt.outputPath);
      
      if (!parseResult.success || !parseResult.result) {
        return this.createFailedResult(task, startTime,
          `Failed to parse result: ${parseResult.errors?.join(', ')}`
        );
      }
      
      // 4. Validate with sub-agent
      onProgress?.({ type: 'validating', taskId: task.id });
      const validation = await this.validateResult(task, parseResult.result);
      
      // Update result with validation
      const finalResult: TaskResult = {
        ...parseResult.result,
        validation,
        started_at: startTime,
        completed_at: new Date().toISOString(),
      };
      
      // If validation failed, mark as failed
      if (!validation.passed) {
        finalResult.status = 'failed';
        finalResult.failure_reason = `Validation failed: ${validation.validator_output}`;
      }
      
      onProgress?.({ 
        type: finalResult.status === 'success' ? 'complete' : 'failed',
        taskId: task.id,
        ...(finalResult.status === 'success' ? { result: finalResult } : { reason: finalResult.failure_reason || 'Unknown' })
      });
      
      return finalResult;
      
    } catch (error) {
      const result = this.createFailedResult(task, startTime, error.message);
      onProgress?.({ type: 'failed', taskId: task.id, reason: error.message });
      return result;
    }
  }
  
  private async validateResult(task: Task, result: TaskResult): Promise<ValidationResult> {
    // Read relevant code files for context
    const codeContext = await this.gatherCodeContext(result.files_created, result.files_modified);
    
    // Call LLM service for validation
    return this.config.llmService.validateTaskResult(task, result, codeContext);
  }
  
  private async gatherCodeContext(created: string[], modified: string[]): Promise<string> {
    const files = [...created, ...modified];
    const contents: string[] = [];
    
    for (const file of files.slice(0, 5)) { // Limit to 5 files
      try {
        const content = await fs.readFile(path.join(this.config.projectDir, file), 'utf-8');
        contents.push(`=== ${file} ===\n${content}`);
      } catch {}
    }
    
    return contents.join('\n\n');
  }
  
  private createFailedResult(task: Task, startTime: string, reason: string): TaskResult {
    const result = createTaskResult(task.id, task.description);
    result.status = 'failed';
    result.failure_reason = reason;
    result.started_at = startTime;
    result.completed_at = new Date().toISOString();
    result.duration_seconds = Math.floor(
      (new Date(result.completed_at).getTime() - new Date(startTime).getTime()) / 1000
    );
    return result;
  }
}
```

Write tests in tests/unit/lib/execution/task-executor.test.ts:
- Mock Claude adapter and LLM service
- Test successful execution flow
- Test handles execution failure
- Test handles parse failure
- Test validation failure marks task failed
- Test progress callbacks called
```

**Verification Checklist**:
- [ ] Builds and writes prompt
- [ ] Executes Claude Code
- [ ] Parses result file
- [ ] Runs validation
- [ ] Returns complete TaskResult
- [ ] Progress callbacks work
- [ ] All tests pass

---

## Step 28: Phase Executor

**Goal**: Execute all tasks in an implementation phase.

```text
Create phase executor.

File: src/lib/execution/phase-executor.ts

```typescript
import { ImplementationPhase, Task, TaskResult, TaskStatus } from '../../types';
import { TaskExecutor } from './task-executor';
import { StateManager } from '../state/state-manager';
import { DependencyResolver } from '../state/dependency-resolver';
import * as terminal from '../ui/terminal';

interface PhaseExecutorConfig {
  taskExecutor: TaskExecutor;
  stateManager: StateManager;
}

interface PhaseResult {
  success: boolean;
  phase: number;
  tasksCompleted: number;
  tasksFailed: number;
  totalDuration: number;
  totalCost: number;
  failedTaskId?: string;
}

type PhaseProgressCallback = (event: PhaseProgressEvent) => void;

type PhaseProgressEvent =
  | { type: 'phase_started'; phase: number; name: string; totalTasks: number }
  | { type: 'task_starting'; taskId: string; description: string; progress: string }
  | { type: 'task_completed'; taskId: string; duration: number; cost: number }
  | { type: 'task_failed'; taskId: string; reason: string }
  | { type: 'phase_completed'; result: PhaseResult };

export class PhaseExecutor {
  constructor(private config: PhaseExecutorConfig) {}
  
  async execute(
    phase: ImplementationPhase,
    onProgress?: PhaseProgressCallback
  ): Promise<PhaseResult> {
    const startTime = Date.now();
    let tasksCompleted = 0;
    let tasksFailed = 0;
    let totalCost = 0;
    let failedTaskId: string | undefined;
    
    onProgress?.({
      type: 'phase_started',
      phase: phase.phase_number,
      name: phase.name,
      totalTasks: phase.tasks.length,
    });
    
    // Create resolver for dependency tracking
    const resolver = new DependencyResolver(phase.tasks);
    
    // Execute tasks sequentially, respecting dependencies
    let nextTask = resolver.getNextRunnable();
    
    while (nextTask) {
      const taskIndex = phase.tasks.findIndex(t => t.id === nextTask!.id);
      const progress = `${taskIndex + 1}/${phase.tasks.length}`;
      
      onProgress?.({
        type: 'task_starting',
        taskId: nextTask.id,
        description: nextTask.description,
        progress,
      });
      
      // Mark task as in progress
      this.config.stateManager.startTask(nextTask.id);
      await this.config.stateManager.save();
      
      // Execute task
      const result = await this.config.taskExecutor.execute(nextTask, phase, (event) => {
        // Forward task events as needed
      });
      
      // Store result
      if (result.status === 'success') {
        this.config.stateManager.completeTask(nextTask.id, result);
        tasksCompleted++;
        totalCost += result.cost_usd;
        
        onProgress?.({
          type: 'task_completed',
          taskId: nextTask.id,
          duration: result.duration_seconds,
          cost: result.cost_usd,
        });
      } else {
        this.config.stateManager.failTask(nextTask.id, result);
        tasksFailed++;
        failedTaskId = nextTask.id;
        
        onProgress?.({
          type: 'task_failed',
          taskId: nextTask.id,
          reason: result.failure_reason || 'Unknown error',
        });
        
        // Stop on first failure
        break;
      }
      
      await this.config.stateManager.save();
      
      // Get next task (re-evaluate after completion)
      nextTask = resolver.getNextRunnable();
    }
    
    const totalDuration = Math.floor((Date.now() - startTime) / 1000);
    const success = tasksFailed === 0 && tasksCompleted === phase.tasks.length;
    
    const result: PhaseResult = {
      success,
      phase: phase.phase_number,
      tasksCompleted,
      tasksFailed,
      totalDuration,
      totalCost,
      failedTaskId,
    };
    
    onProgress?.({ type: 'phase_completed', result });
    
    return result;
  }
}
```

Write tests in tests/unit/lib/execution/phase-executor.test.ts:
- Mock task executor
- Test executes tasks in order
- Test respects dependencies
- Test stops on failure
- Test updates state after each task
- Test progress events emitted
```

**Verification Checklist**:
- [ ] Executes tasks sequentially
- [ ] Respects dependencies
- [ ] Stops on first failure
- [ ] Updates state after each task
- [ ] Progress events work
- [ ] Returns accurate summary
- [ ] All tests pass

---

## Step 29: Execution Orchestrator

**Goal**: Coordinate execution across implementation phases.

```text
Create execution orchestrator.

File: src/lib/execution/orchestrator.ts

```typescript
import { ImplementationPhase, TaskResult } from '../../types';
import { PhaseExecutor, PhaseResult } from './phase-executor';
import { StateManager } from '../state/state-manager';
import { PhaseManager } from '../state/phase-manager';
import * as terminal from '../ui/terminal';

interface ExecutionOrchestratorConfig {
  phaseExecutor: PhaseExecutor;
  stateManager: StateManager;
  phaseManager: PhaseManager;
  onApprovalRequired?: (phase: number, result: PhaseResult) => Promise<boolean>;
}

interface ExecutionResult {
  success: boolean;
  phasesCompleted: number;
  totalPhases: number;
  totalCost: number;
  failureReason?: string;
  failedTaskId?: string;
}

export class ExecutionOrchestrator {
  private running: boolean = false;
  private shouldStop: boolean = false;
  
  constructor(private config: ExecutionOrchestratorConfig) {}
  
  async run(): Promise<ExecutionResult> {
    this.running = true;
    this.shouldStop = false;
    
    const meta = this.config.stateManager.getMeta();
    const doc = this.config.stateManager.getProject();
    const implPhases = doc.implementation_phases;
    
    let currentPhaseNum = meta.implementation?.current_impl_phase || 1;
    let phasesCompleted = meta.implementation?.completed_phases || 0;
    let totalCost = meta.cost.total_cost_usd;
    
    terminal.printHeader('Implementation Execution');
    terminal.printInfo(`Starting from phase ${currentPhaseNum} of ${implPhases.length}`);
    
    while (currentPhaseNum <= implPhases.length && !this.shouldStop) {
      const phase = implPhases[currentPhaseNum - 1];
      
      terminal.printSection(`Implementation Phase ${phase.phase_number}`, phase.name);
      
      // Execute phase
      const result = await this.config.phaseExecutor.execute(phase, (event) => {
        this.handleProgressEvent(event);
      });
      
      totalCost += result.totalCost;
      
      if (!result.success) {
        this.running = false;
        return {
          success: false,
          phasesCompleted,
          totalPhases: implPhases.length,
          totalCost,
          failureReason: `Task ${result.failedTaskId} failed`,
          failedTaskId: result.failedTaskId,
        };
      }
      
      phasesCompleted++;
      
      // Update state
      this.config.stateManager.updateMeta({
        ...meta,
        implementation: {
          ...meta.implementation!,
          completed_phases: phasesCompleted,
          current_impl_phase: currentPhaseNum + 1,
          current_impl_phase_name: implPhases[currentPhaseNum]?.name || 'Complete',
        },
        cost: {
          ...meta.cost,
          total_cost_usd: totalCost,
        },
      });
      await this.config.stateManager.save();
      
      // Request approval before next phase
      if (currentPhaseNum < implPhases.length && this.config.onApprovalRequired) {
        terminal.printSuccess(`Phase ${currentPhaseNum} complete!`);
        
        const approved = await this.config.onApprovalRequired(currentPhaseNum, result);
        if (!approved) {
          terminal.printInfo('Approval not granted. Stopping.');
          break;
        }
        
        // Record approval
        this.config.stateManager.approvePhase(`impl-${currentPhaseNum}`);
        await this.config.stateManager.save();
      }
      
      currentPhaseNum++;
    }
    
    this.running = false;
    
    const allComplete = phasesCompleted === implPhases.length;
    
    if (allComplete) {
      terminal.printSuccess('All implementation phases complete!');
    }
    
    return {
      success: allComplete,
      phasesCompleted,
      totalPhases: implPhases.length,
      totalCost,
    };
  }
  
  stop(): void {
    this.shouldStop = true;
  }
  
  isRunning(): boolean {
    return this.running;
  }
  
  private handleProgressEvent(event: PhaseProgressEvent): void {
    switch (event.type) {
      case 'task_starting':
        terminal.printInfo(`[${event.progress}] Starting: ${event.taskId} - ${event.description}`);
        break;
      case 'task_completed':
        terminal.printSuccess(`Completed: ${event.taskId} (${terminal.formatDuration(event.duration)}, ${terminal.formatCost(event.cost)})`);
        break;
      case 'task_failed':
        terminal.printError(`Failed: ${event.taskId} - ${event.reason}`);
        break;
    }
  }
}
```

Update src/commands/resume.ts to use ExecutionOrchestrator:

```typescript
// At the end of resumeCommand, after all planning approved:

if (meta.gates.planning_approved) {
  // Set up execution
  const claudeAdapter = new ClaudeAdapter({
    workingDir: projectDir,
    timeoutMs: meta.agent.timeout_minutes * 60 * 1000,
    dangerouslySkipPermissions: true,
  });
  
  if (!await claudeAdapter.isAvailable()) {
    terminal.printError('Claude CLI not found.');
    terminal.printInfo('Install with: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }
  
  const promptBuilder = new TaskPromptBuilder({ ... });
  const resultParser = new TaskResultParser();
  const taskExecutor = new TaskExecutor({ claudeAdapter, promptBuilder, resultParser, llmService, projectDir });
  const phaseExecutor = new PhaseExecutor({ taskExecutor, stateManager });
  
  const orchestrator = new ExecutionOrchestrator({
    phaseExecutor,
    stateManager,
    phaseManager,
    onApprovalRequired: async (phase, result) => {
      terminal.printInfo(`Phase ${phase} complete. ${result.tasksCompleted} tasks, ${terminal.formatCost(result.totalCost)}`);
      return terminal.confirm('Approve and continue to next phase?', true);
    },
  });
  
  const result = await orchestrator.run();
  
  if (result.success) {
    terminal.printSuccess('Project implementation complete!');
  } else {
    terminal.printError(`Implementation stopped: ${result.failureReason}`);
    if (result.failedTaskId) {
      terminal.printInfo(`Failed task: ${result.failedTaskId}`);
      terminal.printInfo('Options:');
      terminal.printInfo(`  orchestrator retry ${result.failedTaskId}  - Retry the failed task`);
      terminal.printInfo(`  orchestrator skip ${result.failedTaskId} --reason "..."  - Skip the task`);
    }
  }
}
```

Write tests in tests/unit/lib/execution/orchestrator.test.ts:
- Execute single phase
- Execute multiple phases
- Stop on failure
- Request approval between phases
- Track total cost
```

**Verification Checklist**:
- [ ] Executes phases in order
- [ ] Requests approval between phases
- [ ] Stops on task failure
- [ ] Shows retry/skip options on failure
- [ ] Tracks cumulative cost
- [ ] Updates state correctly
- [ ] All tests pass

---

## Manual Checkpoint F

**Before proceeding to Phase G, test execution end-to-end:**

```bash
# This requires a project with approved planning and Claude CLI installed

# 1. Ensure Claude CLI is available
claude --version

# 2. Create a minimal test project
mkdir /tmp/exec-test && cd /tmp/exec-test
orchestrator init "A hello world CLI that prints a greeting"

# 3. Complete and approve all planning phases quickly
# 4. Run execution
orchestrator resume

# 5. Observe:
# - Tasks execute one by one
# - Results written to tasks/results/
# - PROJECT.md updated
# - Approval requested between impl phases

# 6. Test retry flow:
# - If a task fails, try: orchestrator retry <task-id>
# - Verify it resets and re-runs

# 7. Check results
ls tasks/results/
cat PROJECT.md

# 8. Clean up
rm -rf /tmp/exec-test
```

**Checkpoint Checklist**:
- [ ] All tests pass (~145 tests)
- [ ] Claude CLI executes tasks
- [ ] Results parsed correctly
- [ ] Sub-agent validation works
- [ ] Phase execution stops on failure
- [ ] Retry command resets and allows re-execution
- [ ] Approvals requested between phases

---

# Phase G: Git Workflow (Steps 30-32)

## Step 30: Git Client

**Goal**: Create Git operations wrapper.

```text
Create Git client wrapper.

Install: npm install simple-git

File: src/lib/git/git-client.ts

```typescript
import simpleGit, { SimpleGit } from 'simple-git';

interface GitConfig {
  workingDir: string;
  branchPrefix: string;
}

interface CommitResult {
  hash: string;
  branch: string;
}

export class GitClient {
  private git: SimpleGit;
  
  constructor(private config: GitConfig) {
    this.git = simpleGit(config.workingDir);
  }
  
  // Check if in a git repo
  async isRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }
  
  // Initialize repo if not exists
  async initIfNeeded(): Promise<boolean> {
    if (await this.isRepo()) return false;
    await this.git.init();
    return true;
  }
  
  // Branch operations
  async getCurrentBranch(): Promise<string> {
    const result = await this.git.branch();
    return result.current;
  }
  
  async branchExists(name: string): Promise<boolean> {
    const result = await this.git.branch();
    return result.all.includes(name);
  }
  
  async createBranch(name: string): Promise<void> {
    await this.git.checkoutLocalBranch(name);
  }
  
  async checkout(name: string): Promise<void> {
    await this.git.checkout(name);
  }
  
  // Commit operations
  async hasChanges(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }
  
  async stageAll(): Promise<void> {
    await this.git.add('.');
  }
  
  async commit(message: string): Promise<CommitResult> {
    await this.git.add('.');
    const result = await this.git.commit(message);
    return {
      hash: result.commit,
      branch: await this.getCurrentBranch(),
    };
  }
  
  async getLastCommitHash(): Promise<string> {
    const log = await this.git.log({ maxCount: 1 });
    return log.latest?.hash || '';
  }
  
  // Utilities
  formatBranchName(phase: number | string, name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
    return `${this.config.branchPrefix}${phase}-${slug}`;
  }
  
  formatCommitMessage(prefix: string, message: string): string {
    return `${prefix}: ${message}`;
  }
}
```

Write tests in tests/unit/lib/git/git-client.test.ts:
- Use temp directory with git init
- Test branch creation
- Test commit creates hash
- Test hasChanges detection
- Test formatBranchName
- Clean up after tests
```

**Verification Checklist**:
- [ ] isRepo() detects git directory
- [ ] Branch operations work
- [ ] Commits create hashes
- [ ] hasChanges() accurate
- [ ] Format functions work
- [ ] All tests pass

---

## Step 31: Git Workflow Manager

**Goal**: Manage Git workflow for orchestrator.

```text
Create Git workflow manager.

File: src/lib/git/workflow-manager.ts

```typescript
import { GitClient } from './git-client';
import { TaskResult } from '../../types';

interface WorkflowConfig {
  gitClient: GitClient;
  enabled: boolean;
  autoCommit: boolean;
}

export class GitWorkflowManager {
  constructor(private config: WorkflowConfig) {}
  
  // Check if Git operations should run
  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  // Start a new implementation phase branch
  async startImplPhase(phaseNumber: number, phaseName: string): Promise<string | null> {
    if (!this.config.enabled) return null;
    
    const branchName = this.config.gitClient.formatBranchName(phaseNumber, phaseName);
    
    // Check if branch already exists
    if (await this.config.gitClient.branchExists(branchName)) {
      await this.config.gitClient.checkout(branchName);
    } else {
      await this.config.gitClient.createBranch(branchName);
    }
    
    return branchName;
  }
  
  // Commit after task completion
  async commitTask(taskId: string, result: TaskResult): Promise<string | null> {
    if (!this.config.enabled || !this.config.autoCommit) return null;
    
    if (!await this.config.gitClient.hasChanges()) return null;
    
    const message = this.config.gitClient.formatCommitMessage(
      `task-${taskId}`,
      result.summary.substring(0, 72)
    );
    
    const commit = await this.config.gitClient.commit(message);
    return commit.hash;
  }
  
  // Commit state changes
  async commitStateChange(action: string): Promise<string | null> {
    if (!this.config.enabled || !this.config.autoCommit) return null;
    
    if (!await this.config.gitClient.hasChanges()) return null;
    
    const message = this.config.gitClient.formatCommitMessage('orchestrator', action);
    const commit = await this.config.gitClient.commit(message);
    return commit.hash;
  }
  
  // Ensure working directory is clean before operations
  async ensureClean(): Promise<void> {
    if (!this.config.enabled) return;
    
    if (await this.config.gitClient.hasChanges()) {
      // Auto-commit pending changes
      await this.config.gitClient.commit('orchestrator: save pending changes');
    }
  }
}
```

Write tests in tests/unit/lib/git/workflow-manager.test.ts:
- Test startImplPhase creates branch
- Test commitTask commits with correct message
- Test disabled mode returns null
- Test ensureClean commits pending
```

**Verification Checklist**:
- [ ] Branch creation works
- [ ] Task commits formatted correctly
- [ ] State commits work
- [ ] Disabled mode skips operations
- [ ] All tests pass

---

## Step 32: Integrate Git with Execution

**Goal**: Wire Git into execution pipeline.

```text
Integrate Git workflow into execution.

File: src/lib/execution/task-executor.ts (update)

Add Git integration:

```typescript
interface TaskExecutorConfig {
  // ... existing config ...
  gitWorkflow?: GitWorkflowManager;
}

export class TaskExecutor {
  async execute(task: Task, phase: ImplementationPhase, onProgress?: ProgressCallback): Promise<TaskResult> {
    // ... existing execution code ...
    
    // After successful execution, commit
    if (this.config.gitWorkflow && result.status === 'success') {
      const hash = await this.config.gitWorkflow.commitTask(task.id, result);
      if (hash) {
        result.commit_hash = hash;
      }
    }
    
    return result;
  }
}
```

File: src/lib/execution/phase-executor.ts (update)

Add phase branch management:

```typescript
interface PhaseExecutorConfig {
  // ... existing config ...
  gitWorkflow?: GitWorkflowManager;
}

export class PhaseExecutor {
  async execute(phase: ImplementationPhase, onProgress?: PhaseProgressCallback): Promise<PhaseResult> {
    // Start phase branch
    if (this.config.gitWorkflow) {
      await this.config.gitWorkflow.startImplPhase(phase.phase_number, phase.name);
    }
    
    // ... existing execution code ...
    
    return result;
  }
}
```

File: src/commands/resume.ts (update)

Add Git setup:

```typescript
// In resumeCommand, when setting up execution:

const gitClient = new GitClient({
  workingDir: projectDir,
  branchPrefix: 'phase-',
});

// Initialize git if needed
if (await gitClient.initIfNeeded()) {
  terminal.printInfo('Initialized Git repository');
}

const gitWorkflow = new GitWorkflowManager({
  gitClient,
  enabled: true,  // Could be from config
  autoCommit: true,
});

// Pass to executors
const taskExecutor = new TaskExecutor({
  // ... other config ...
  gitWorkflow,
});
```

Update status command to show Git info:

```typescript
// In statusCommand, add Git status section:

if (await gitClient.isRepo()) {
  const branch = await gitClient.getCurrentBranch();
  const hasChanges = await gitClient.hasChanges();
  terminal.printSection('Git', `Branch: ${branch}${hasChanges ? ' (uncommitted changes)' : ''}`);
}
```

Write integration tests in tests/integration/git-workflow.test.ts:
- Task completion creates commit
- Phase creates branch
- Status shows git info
- Full workflow produces clean history
```

**Verification Checklist**:
- [ ] Task commits created
- [ ] Phase branches created
- [ ] Commit hashes stored in results
- [ ] Status shows git info
- [ ] Integration tests pass

---

## Manual Checkpoint G

**Test Git workflow:**

```bash
# 1. Run all tests
npm test

# 2. Test Git integration
mkdir /tmp/git-test && cd /tmp/git-test
git init
orchestrator init "Git test project"

# 3. Check initial state
git log --oneline
git branch

# 4. Complete planning phases, approve each

# 5. Run execution (with simple tasks)
orchestrator resume

# 6. Check Git history
git log --oneline --all
git branch

# 7. Verify:
# - Branch per implementation phase
# - Commit per task
# - Commit messages follow convention

# 8. Clean up
rm -rf /tmp/git-test
```

**Checkpoint Checklist**:
- [ ] All tests pass (~160 tests)
- [ ] Git initialized if needed
- [ ] Phase branches created
- [ ] Task commits have correct format
- [ ] Status shows git info

---

# Phase H: Integration (Steps 33-34)

## Step 33: Full Pipeline Integration

**Goal**: Create unified pipeline and ensure all components work together.

```text
Create unified pipeline and wire everything together.

File: src/lib/pipeline.ts

```typescript
import { DocumentManager } from './documents';
import { StateManager } from './state/state-manager';
import { PhaseManager } from './state/phase-manager';
import { LLMService } from './llm/llm-service';
import { IdeationPhase } from './phases/ideation-phase';
import { SpecPhase } from './phases/spec-phase';
import { PlanningPhase } from './phases/planning-phase';
import { ExecutionOrchestrator } from './execution/orchestrator';
import { GitWorkflowManager } from './git/workflow-manager';
import * as terminal from './ui/terminal';

interface PipelineConfig {
  projectDir: string;
  interactive: boolean;
}

interface PipelineSummary {
  projectName: string;
  phasesCompleted: string[];
  tasksCompleted: number;
  totalCost: number;
}

export class Pipeline {
  private documentManager: DocumentManager;
  private stateManager: StateManager;
  private phaseManager: PhaseManager;
  private llmService: LLMService;
  
  constructor(private config: PipelineConfig) {
    this.documentManager = new DocumentManager(config.projectDir);
    this.stateManager = new StateManager(this.documentManager, config.projectDir);
    this.phaseManager = new PhaseManager(this.stateManager);
    this.llmService = new LLMService({});
  }
  
  async initAndRun(idea: string): Promise<PipelineSummary> {
    // Initialize project
    await initProjectDir(this.config.projectDir, slugify(idea));
    await this.stateManager.load();
    
    const phasesCompleted: string[] = [];
    let totalCost = 0;
    
    // Run Phase 1
    const phase1 = await this.runPhase1(idea);
    if (!phase1.success) throw new Error('Phase 1 failed');
    phasesCompleted.push('ideation');
    totalCost += phase1.cost;
    
    if (this.config.interactive) {
      await this.waitForApproval('phase-1');
    }
    
    // Run Phase 2
    const phase2 = await this.runPhase2();
    if (!phase2.success) throw new Error('Phase 2 failed');
    phasesCompleted.push('specification');
    totalCost += phase2.cost;
    
    if (this.config.interactive) {
      await this.waitForApproval('phase-2');
    }
    
    // Run Phase 3
    const phase3 = await this.runPhase3();
    if (!phase3.success) throw new Error('Phase 3 failed');
    phasesCompleted.push('planning');
    totalCost += phase3.cost;
    
    if (this.config.interactive) {
      await this.waitForApproval('phase-3');
    }
    
    // Run Implementation
    const impl = await this.runImplementation();
    if (impl.success) {
      phasesCompleted.push('implementation');
    }
    totalCost += impl.totalCost;
    
    return {
      projectName: this.stateManager.getMeta().project_name,
      phasesCompleted,
      tasksCompleted: impl.tasksCompleted,
      totalCost,
    };
  }
  
  async resume(): Promise<PipelineSummary> {
    await this.stateManager.load();
    // Similar logic to initAndRun but checks current state first
    // Delegates to appropriate phase based on gates
  }
  
  private async runPhase1(idea: string) {
    const runner = new IdeationPhase({
      llmService: this.llmService,
      stateManager: this.stateManager,
      documentManager: this.documentManager,
    });
    return runner.run({ idea });
  }
  
  private async runPhase2() {
    const doc = this.stateManager.getProject();
    const runner = new SpecPhase({
      llmService: this.llmService,
      stateManager: this.stateManager,
      documentManager: this.documentManager,
    });
    return runner.run({ ideation: doc.ideation! });
  }
  
  private async runPhase3() {
    const doc = this.stateManager.getProject();
    const runner = new PlanningPhase({
      llmService: this.llmService,
      stateManager: this.stateManager,
      documentManager: this.documentManager,
    });
    return runner.run({ specification: doc.specification! });
  }
  
  private async runImplementation() {
    // Set up execution components
    // Run ExecutionOrchestrator
    // Return summary
  }
  
  private async waitForApproval(phase: string): Promise<void> {
    terminal.printInfo(`Waiting for approval of ${phase}...`);
    const approved = await terminal.confirm('Approve and continue?', true);
    if (approved) {
      this.stateManager.approvePhase(phase);
      await this.stateManager.save();
    } else {
      throw new Error('User declined approval');
    }
  }
}
```

Ensure all commands use consistent patterns:

File: src/commands/status.ts (final update)

```typescript
// Complete status command showing all info including failed tasks
export async function statusCommand(options: StatusOptions): Promise<void> {
  const projectDir = findProjectRoot(options.dir);
  if (!projectDir) {
    terminal.printError('Not in an orchestrator project.');
    process.exit(1);
  }
  
  const dm = new DocumentManager(projectDir);
  const state = new StateManager(dm, projectDir);
  await state.load();
  
  const meta = state.getMeta();
  const doc = state.getProject();
  const phaseManager = new PhaseManager(state);
  
  if (options.json) {
    console.log(JSON.stringify({
      project: meta.project_name,
      currentPhase: meta.current_phase,
      phaseStatus: meta.phase_status,
      gates: meta.gates,
      implementation: meta.implementation,
      cost: meta.cost,
      failedTasks: state.getFailedTasks().map(t => t.id),
    }, null, 2));
    return;
  }
  
  // Header
  terminal.printHeader(meta.project_name);
  
  // Phase status
  terminal.printSection('Current Phase', 
    `${meta.current_phase}: ${meta.current_phase_name} (${meta.phase_status})`
  );
  
  // Gates
  terminal.printSection('Phase Gates', formatGates(meta.gates));
  
  // Failed tasks warning
  const failedTasks = state.getFailedTasks();
  if (failedTasks.length > 0) {
    terminal.printWarning(`${failedTasks.length} failed task(s):`);
    failedTasks.forEach(t => {
      terminal.printWarning(`  ${t.id}: ${t.description}`);
    });
    terminal.printInfo('Use "orchestrator retry <task-id>" or "orchestrator skip <task-id> --reason ..."');
  }
  
  // Implementation progress (if applicable)
  if (meta.implementation) {
    terminal.printSection('Implementation', 
      `Phase ${meta.implementation.current_impl_phase}/${meta.implementation.total_phases}: ${meta.implementation.current_impl_phase_name}`
    );
    
    const currentPhase = doc.implementation_phases[meta.implementation.current_impl_phase - 1];
    if (currentPhase) {
      const completed = currentPhase.tasks.filter(t => t.status === 'complete').length;
      const failed = currentPhase.tasks.filter(t => t.status === 'failed').length;
      terminal.printInfo(`Tasks: ${completed}/${currentPhase.tasks.length} complete${failed ? `, ${failed} failed` : ''}`);
    }
  }
  
  // Cost
  terminal.printSection('Cost', terminal.formatCost(meta.cost.total_cost_usd));
  
  // Readiness (if phase complete but not approved)
  if (meta.phase_status === 'complete') {
    const readiness = phaseManager.getReadinessForApproval(meta.current_phase);
    if (!readiness.ready) {
      terminal.printWarning('Not ready for approval:');
      readiness.blockers.forEach(b => terminal.printWarning(`  - ${b}`));
    } else {
      terminal.printSuccess('Ready for approval');
      terminal.printInfo(`Run: orchestrator approve ${formatPhaseArg(meta.current_phase)}`);
    }
  }
  
  // Git status
  const gitClient = new GitClient({ workingDir: projectDir, branchPrefix: 'phase-' });
  if (await gitClient.isRepo()) {
    const branch = await gitClient.getCurrentBranch();
    terminal.printSection('Git', `Branch: ${branch}`);
  }
}
```

Write integration tests in tests/integration/pipeline.test.ts:
- Test full pipeline with mocked LLM
- Test resume from various states
- Test error handling
```

**Verification Checklist**:
- [ ] Pipeline coordinates all phases
- [ ] Resume handles all states
- [ ] Status shows complete info including failed tasks
- [ ] All commands consistent
- [ ] Integration tests pass

---

## Step 34: Final Testing and Documentation

**Goal**: Complete testing and create documentation.

```text
Final testing, documentation, and cleanup.

File: README.md

Create comprehensive documentation:

```markdown
# Orchestrator

Autonomous development pipeline that takes an idea through refinement, specification, planning, and implementation.

## Installation

\`\`\`bash
npm install -g @orchestrator/cli
\`\`\`

## Prerequisites

- Node.js 20+
- Claude CLI (`npm install -g @anthropic-ai/claude-code`)
- Anthropic API key (`export ANTHROPIC_API_KEY=your-key`)

## Quick Start

\`\`\`bash
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
\`\`\`

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

\`\`\`
your-project/
├── PROJECT.md       # Master document with all state
├── CLAUDE.md        # Agent context
└── tasks/
    └── results/     # Task result JSON files
\`\`\`

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

## License

MIT
\`\`\`

File: tests/e2e/full-pipeline.test.ts

Create end-to-end test (for manual running):

```typescript
import { describe, it, expect } from 'vitest';
import { Pipeline } from '../../src/lib/pipeline';

describe('Full Pipeline E2E', () => {
  it('should complete simple project', async () => {
    // Skip unless explicitly enabled
    if (process.env.RUN_E2E !== 'true') {
      console.log('Skipping E2E test. Set RUN_E2E=true to run.');
      return;
    }
    
    const pipeline = new Pipeline({
      projectDir: '/tmp/e2e-test-' + Date.now(),
      interactive: false,
    });
    
    const result = await pipeline.initAndRun('A hello world CLI');
    
    expect(result.phasesCompleted).toContain('ideation');
    expect(result.phasesCompleted).toContain('specification');
    expect(result.phasesCompleted).toContain('planning');
  }, 300000);  // 5 minute timeout
});
```

Final cleanup:
- Remove console.log debugging
- Ensure all exports correct
- Run full test suite
- Run linting
- Build production version
```

**Verification Checklist**:
- [ ] README is comprehensive
- [ ] All commands documented including retry
- [ ] E2E test exists
- [ ] All tests pass (~170 tests)
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Package exports correct

---

## Final Manual Verification

```text
FINAL TESTING CHECKLIST

Complete end-to-end verification:

### Test 1: Fresh Install
1. Clone repo to new location
2. npm install
3. npm run build
4. npm link
5. Verify `orchestrator --help` works

### Test 2: Full Project Flow
1. orchestrator init "A markdown note app"
2. Complete all interactive phases
3. Approve each phase
4. Run through implementation
5. Verify final output works

### Test 3: Resume at Each Point
1. Create project, stop mid-Phase-1
2. orchestrator resume - verify continues
3. Stop after Phase 2 complete but not approved
4. orchestrator resume - verify asks for approval
5. Test resume after task failure

### Test 4: Retry Flow
1. Create project that will have a failing task
2. Let execution run until failure
3. orchestrator status - verify shows failed task
4. orchestrator retry <task-id> - verify resets to pending
5. orchestrator resume - verify re-executes task

### Test 5: Skip Flow  
1. Have a failed task
2. orchestrator skip <task-id> --reason "manual"
3. orchestrator resume - verify continues past skipped task

### Test 6: Git Workflow
1. Create project in git repo
2. Complete full flow
3. git log --oneline --all
4. Verify branches created
5. Verify commits per task
6. Check git log is clean

### Record Results:
- [ ] Test 1: Fresh install works
- [ ] Test 2: Full flow works
- [ ] Test 3: Resume works at all points
- [ ] Test 4: Retry flow works
- [ ] Test 5: Skip flow works
- [ ] Test 6: Git workflow clean

### Performance Notes:
- Phase 1 average duration: ___ minutes
- Phase 2 average duration: ___ minutes
- Phase 3 average duration: ___ minutes
- Average task duration: ___ seconds
- Total cost for test: $___

### Issues Found:
[Document any issues]

### Sign-off:
- [ ] All tests pass
- [ ] Documentation complete
- [ ] Ready for use
```

---

# Summary

## Final Statistics

| Metric | Count |
|--------|-------|
| Total Steps | 34 |
| Manual Checkpoints | 6 |
| Estimated Tests | ~170 |
| Source Files | ~45 |
| Estimated LOC | ~4,500 |

## What's Included

✅ Interactive phases 1-3 (ideation, spec, planning)
✅ Sequential task execution
✅ Sub-agent validation
✅ Git workflow (branches, commits)
✅ CLI with all commands (init, resume, status, approve, skip, retry)
✅ Retry logic (reset failed task to pending)
✅ Cost tracking
✅ PROJECT.md as single source of truth

## What's Excluded (v2)

❌ Parallel task execution
❌ Conversation save/resume
❌ DAG HTML viewer
❌ Separate CHANGELOG.md
❌ Multi-agent failover
❌ Langfuse tracing

## Build Order

```
Phase A (1-5)   → Foundation
Phase B (6-11)  → Document Layer
Phase C (12-14) → State Management
Phase D (15-18) → LLM Integration
Phase E (19-23) → Interactive Phases
Phase F (24-29) → Execution Engine
Phase G (30-32) → Git Workflow
Phase H (33-34) → Integration
```

Each phase builds on the previous. Do not skip steps.
