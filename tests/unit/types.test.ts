import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  type ProjectMeta,
  type Task,
  type TaskResult,
  type ValidationResult,
  type ProjectDocument,
  type IdeationContent,
  type SpecificationContent,
  type ImplementationPhase,
  OrchestratorError,
  DocumentParseError,
  StateError,
  TaskExecutionError,
  ValidationError,
  GitError,
  LLMError,
} from '../../src/types/index.js';

describe('Type Definitions', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_CONFIG.agent).toBeDefined();
      expect(DEFAULT_CONFIG.agent.primary).toBe('claude-code');
      expect(DEFAULT_CONFIG.agent.timeout_minutes).toBe(10);

      expect(DEFAULT_CONFIG.git).toBeDefined();
      expect(DEFAULT_CONFIG.git.enabled).toBe(true);
      expect(DEFAULT_CONFIG.git.auto_commit).toBe(true);
      expect(DEFAULT_CONFIG.git.branch_prefix).toBe('phase-');

      expect(DEFAULT_CONFIG.llm).toBeDefined();
      expect(DEFAULT_CONFIG.llm.provider).toBe('anthropic');
      expect(DEFAULT_CONFIG.llm.model).toBe('claude-sonnet-4-20250514');
      expect(DEFAULT_CONFIG.llm.max_tokens).toBe(8192);
    });
  });

  describe('Type Interfaces', () => {
    it('should accept valid ProjectMeta', () => {
      const meta: ProjectMeta = {
        version: 1,
        project_id: 'test-123',
        project_name: 'test-project',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
        current_phase: 1,
        current_phase_name: 'Idea Refinement',
        phase_status: 'in_progress',
        gates: {
          ideation_complete: false,
          ideation_approved: false,
          spec_complete: false,
          spec_approved: false,
          planning_complete: false,
          planning_approved: false,
        },
        cost: {
          total_tokens: 0,
          total_cost_usd: 0,
        },
        agent: {
          primary: 'claude-code',
          timeout_minutes: 10,
        },
      };

      expect(meta.version).toBe(1);
      expect(meta.current_phase).toBe(1);
    });

    it('should accept valid Task', () => {
      const task: Task = {
        id: '1.1',
        description: 'Set up project scaffolding',
        status: 'pending',
        depends_on: [],
        acceptance_criteria: ['Package.json exists', 'TypeScript configured'],
      };

      expect(task.id).toBe('1.1');
      expect(task.status).toBe('pending');
      expect(task.depends_on).toHaveLength(0);
    });

    it('should accept valid TaskResult', () => {
      const result: TaskResult = {
        task_id: '1.1',
        task_description: 'Test task',
        status: 'complete',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        duration_ms: 60000,
        summary: 'Task completed successfully',
        files_created: ['src/index.ts'],
        files_modified: [],
        files_deleted: [],
        key_decisions: [{ decision: 'Use TypeScript', rationale: 'Type safety' }],
        assumptions: [],
        tests_added: 2,
        tests_passing: 2,
        tests_failing: 0,
        acceptance_criteria: [{ criterion: 'Tests pass', met: true }],
        validation: {
          passed: true,
          validator_output: 'All criteria met',
          criteria_checked: 1,
          criteria_passed: 1,
        },
        tokens_used: 1000,
        cost_usd: 0.01,
      };

      expect(result.status).toBe('complete');
      expect(result.validation.passed).toBe(true);
    });

    it('should accept valid IdeationContent', () => {
      const ideation: IdeationContent = {
        problem_statement: 'Users need to track todos',
        target_users: 'Developers',
        use_cases: ['Add todo', 'Complete todo', 'Delete todo'],
        success_criteria: ['Fast performance', 'Clean UI'],
        constraints: {
          must_have: ['Local storage'],
          nice_to_have: ['Cloud sync'],
          out_of_scope: ['Mobile app'],
        },
        raw_content: '# Ideation content...',
      };

      expect(ideation.use_cases).toHaveLength(3);
      expect(ideation.constraints.must_have).toHaveLength(1);
    });

    it('should accept valid SpecificationContent', () => {
      const spec: SpecificationContent = {
        architecture: 'Monolith with REST API',
        tech_stack: [
          { layer: 'Backend', choice: 'Node.js', rationale: 'JavaScript ecosystem' },
          { layer: 'Database', choice: 'SQLite', rationale: 'Simple, no server' },
        ],
        data_models: '```typescript\ninterface Todo { id: string; title: string; }```',
        api_contracts: 'POST /todos, GET /todos, DELETE /todos/:id',
        ui_requirements: 'Single page with todo list',
        raw_content: '# Specification content...',
      };

      expect(spec.tech_stack).toHaveLength(2);
    });

    it('should accept valid ImplementationPhase', () => {
      const phase: ImplementationPhase = {
        phase_number: 1,
        name: 'Foundation',
        description: 'Set up project foundation',
        status: 'pending',
        tasks: [
          {
            id: '1.1',
            description: 'Setup scaffolding',
            status: 'pending',
            depends_on: [],
            acceptance_criteria: ['npm init complete'],
          },
        ],
      };

      expect(phase.tasks).toHaveLength(1);
      expect(phase.status).toBe('pending');
    });

    it('should accept valid ProjectDocument', () => {
      const doc: ProjectDocument = {
        meta: {
          version: 1,
          project_id: 'test',
          project_name: 'test',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          current_phase: 1,
          current_phase_name: 'Ideation',
          phase_status: 'pending',
          gates: {
            ideation_complete: false,
            ideation_approved: false,
            spec_complete: false,
            spec_approved: false,
            planning_complete: false,
            planning_approved: false,
          },
          cost: { total_tokens: 0, total_cost_usd: 0 },
          agent: { primary: 'claude-code', timeout_minutes: 10 },
        },
        ideation: null,
        specification: null,
        implementation_phases: [],
        approvals: [],
      };

      expect(doc.ideation).toBeNull();
      expect(doc.implementation_phases).toHaveLength(0);
    });
  });
});

describe('Error Classes', () => {
  describe('OrchestratorError', () => {
    it('should have correct properties', () => {
      const error = new OrchestratorError('Test error', 'TEST_ERROR', { foo: 'bar' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OrchestratorError);
      expect(error.name).toBe('OrchestratorError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.context).toEqual({ foo: 'bar' });
    });
  });

  describe('DocumentParseError', () => {
    it('should extend OrchestratorError', () => {
      const error = new DocumentParseError('Parse failed');

      expect(error).toBeInstanceOf(OrchestratorError);
      expect(error).toBeInstanceOf(DocumentParseError);
      expect(error.name).toBe('DocumentParseError');
      expect(error.code).toBe('DOC_PARSE_ERROR');
    });

    it('should create yamlInvalid error', () => {
      const error = DocumentParseError.yamlInvalid('Bad syntax', 10);

      expect(error.message).toContain('Invalid YAML');
      expect(error.context?.line).toBe(10);
    });

    it('should create missingField error', () => {
      const error = DocumentParseError.missingField('version');

      expect(error.message).toContain('Missing required field');
      expect(error.context?.field).toBe('version');
    });

    it('should create alreadyExists error', () => {
      const error = DocumentParseError.alreadyExists('/path/PROJECT.md');

      expect(error.message).toContain('already exists');
      expect(error.context?.path).toBe('/path/PROJECT.md');
    });
  });

  describe('StateError', () => {
    it('should extend OrchestratorError', () => {
      const error = new StateError('State error');

      expect(error).toBeInstanceOf(OrchestratorError);
      expect(error).toBeInstanceOf(StateError);
      expect(error.name).toBe('StateError');
      expect(error.code).toBe('STATE_ERROR');
    });

    it('should create invalidTransition error', () => {
      const error = StateError.invalidTransition('pending', 'complete');

      expect(error.message).toContain('Invalid state transition');
      expect(error.context?.from).toBe('pending');
      expect(error.context?.to).toBe('complete');
    });

    it('should create taskNotFound error', () => {
      const error = StateError.taskNotFound('1.1');

      expect(error.message).toContain('Task not found');
      expect(error.context?.taskId).toBe('1.1');
    });

    it('should create taskNotFailed error', () => {
      const error = StateError.taskNotFailed('1.1', 'pending');

      expect(error.message).toContain('not in failed status');
      expect(error.context?.taskId).toBe('1.1');
      expect(error.context?.currentStatus).toBe('pending');
    });
  });

  describe('TaskExecutionError', () => {
    it('should extend OrchestratorError', () => {
      const error = new TaskExecutionError('Execution failed');

      expect(error).toBeInstanceOf(OrchestratorError);
      expect(error).toBeInstanceOf(TaskExecutionError);
      expect(error.name).toBe('TaskExecutionError');
      expect(error.code).toBe('TASK_EXEC_ERROR');
    });

    it('should create timeout error', () => {
      const error = TaskExecutionError.timeout('1.1', 60000);

      expect(error.message).toContain('timed out');
      expect(error.context?.taskId).toBe('1.1');
      expect(error.context?.timeoutMs).toBe(60000);
    });

    it('should create executionFailed error', () => {
      const error = TaskExecutionError.executionFailed('1.1', 1, 'Error output');

      expect(error.message).toContain('exit code');
      expect(error.context?.exitCode).toBe(1);
    });
  });

  describe('ValidationError', () => {
    it('should extend OrchestratorError', () => {
      const error = new ValidationError('Validation failed');

      expect(error).toBeInstanceOf(OrchestratorError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should create criteriaNotMet error', () => {
      const error = ValidationError.criteriaNotMet('1.1', ['Tests pass']);

      expect(error.message).toContain('acceptance criteria');
      expect(error.context?.failedCriteria).toEqual(['Tests pass']);
    });
  });

  describe('GitError', () => {
    it('should extend OrchestratorError', () => {
      const error = new GitError('Git error');

      expect(error).toBeInstanceOf(OrchestratorError);
      expect(error).toBeInstanceOf(GitError);
      expect(error.name).toBe('GitError');
      expect(error.code).toBe('GIT_ERROR');
    });

    it('should create notRepo error', () => {
      const error = GitError.notRepo('/path/to/dir');

      expect(error.message).toContain('Not a git repository');
      expect(error.context?.path).toBe('/path/to/dir');
    });
  });

  describe('LLMError', () => {
    it('should extend OrchestratorError', () => {
      const error = new LLMError('LLM error');

      expect(error).toBeInstanceOf(OrchestratorError);
      expect(error).toBeInstanceOf(LLMError);
      expect(error.name).toBe('LLMError');
      expect(error.code).toBe('LLM_ERROR');
    });

    it('should create apiKeyMissing error', () => {
      const error = LLMError.apiKeyMissing();

      expect(error.message).toContain('ANTHROPIC_API_KEY');
    });

    it('should create rateLimited error', () => {
      const error = LLMError.rateLimited(60);

      expect(error.message).toContain('Rate limited');
      expect(error.context?.retryAfter).toBe(60);
    });
  });
});
