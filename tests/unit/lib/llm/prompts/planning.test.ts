import { describe, it, expect } from 'vitest';
import {
  PLANNING_SYSTEM_PROMPT,
  buildPlanningStartPrompt,
  buildPlanningFollowUpPrompt,
  buildPlanningSummaryPrompt,
  parsePlanningResponse,
  parseProposedPhases,
  isPlanningComplete,
  getPlanningIssues,
} from '../../../../../src/lib/llm/prompts/planning.js';
import {
  IdeationContent,
  SpecificationContent,
  ImplementationPhase,
} from '../../../../../src/types/index.js';

const sampleIdeation: IdeationContent = {
  problem_statement: 'Task management',
  target_users: 'Developers',
  use_cases: ['Create tasks', 'Track progress', 'Deadlines'],
  success_criteria: ['Completion rate'],
  constraints: {
    must_have: [],
    nice_to_have: [],
    out_of_scope: [],
  },
};

const sampleSpec: SpecificationContent = {
  architecture: 'Three-tier with React frontend and Node backend',
  tech_stack: ['React', 'Node.js', 'PostgreSQL'],
  data_models: 'Task entity with id, title, status',
  api_contracts: 'REST API',
};

describe('Planning Prompts', () => {
  describe('PLANNING_SYSTEM_PROMPT', () => {
    it('should define project manager role', () => {
      expect(PLANNING_SYSTEM_PROMPT).toContain('project manager');
    });

    it('should mention implementation plan', () => {
      expect(PLANNING_SYSTEM_PROMPT).toContain('implementation plan');
    });
  });

  describe('buildPlanningStartPrompt', () => {
    it('should include project name', () => {
      const prompt = buildPlanningStartPrompt('TaskApp', sampleIdeation, sampleSpec);
      expect(prompt).toContain('TaskApp');
    });

    it('should include specification details', () => {
      const prompt = buildPlanningStartPrompt('Project', sampleIdeation, sampleSpec);

      expect(prompt).toContain('Three-tier');
      expect(prompt).toContain('React');
      expect(prompt).toContain('Task entity');
    });

    it('should request phase breakdown', () => {
      const prompt = buildPlanningStartPrompt('Project', sampleIdeation, sampleSpec);

      expect(prompt).toContain('<proposed_phases>');
      expect(prompt).toContain('<rationale>');
    });
  });

  describe('buildPlanningFollowUpPrompt', () => {
    it('should include user input', () => {
      const prompt = buildPlanningFollowUpPrompt('Start with database');
      expect(prompt).toContain('Start with database');
    });

    it('should show existing phases', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Setup',
          description: 'Initial setup',
          status: 'pending',
          tasks: [
            {
              id: '1.1',
              description: 'Task',
              status: 'pending',
              depends_on: [],
              acceptance_criteria: [],
            },
          ],
        },
      ];

      const prompt = buildPlanningFollowUpPrompt('Continue', phases);

      expect(prompt).toContain('Phase 1: Setup');
      expect(prompt).toContain('1 tasks');
    });

    it('should specify task format', () => {
      const prompt = buildPlanningFollowUpPrompt('Add tasks');

      expect(prompt).toContain('<phase name=');
      expect(prompt).toContain('<task id=');
      expect(prompt).toContain('<acceptance_criteria>');
      expect(prompt).toContain('<depends_on>');
    });
  });

  describe('buildPlanningSummaryPrompt', () => {
    it('should include specification summary', () => {
      const prompt = buildPlanningSummaryPrompt('Discussion', sampleSpec);
      expect(prompt).toContain('Three-tier');
    });

    it('should include conversation summary', () => {
      const prompt = buildPlanningSummaryPrompt('We agreed on 3 phases', sampleSpec);
      expect(prompt).toContain('We agreed on 3 phases');
    });

    it('should specify complete format', () => {
      const prompt = buildPlanningSummaryPrompt('Summary', sampleSpec);

      expect(prompt).toContain('<phase name=');
      expect(prompt).toContain('number=');
      expect(prompt).toContain('<task id=');
      expect(prompt).toContain('At least 2 phases');
    });
  });

  describe('parsePlanningResponse', () => {
    it('should parse complete response', () => {
      const response = `
<phase name="Foundation" number="1">
<description>Set up project infrastructure</description>

<task id="1.1">
<description>Initialize project repository</description>
<acceptance_criteria>
- Repository created
- Basic structure in place
</acceptance_criteria>
<depends_on></depends_on>
</task>

<task id="1.2">
<description>Set up CI/CD</description>
<acceptance_criteria>
- Pipeline configured
</acceptance_criteria>
<depends_on>1.1</depends_on>
</task>
</phase>

<phase name="Core Features" number="2">
<description>Implement main functionality</description>

<task id="2.1">
<description>Create task API</description>
<acceptance_criteria>
- CRUD endpoints working
</acceptance_criteria>
<depends_on>1.2</depends_on>
</task>
</phase>
`;

      const phases = parsePlanningResponse(response);

      expect(phases).toHaveLength(2);
      expect(phases[0]?.name).toBe('Foundation');
      expect(phases[0]?.phase_number).toBe(1);
      expect(phases[0]?.description).toBe('Set up project infrastructure');
      expect(phases[0]?.tasks).toHaveLength(2);

      expect(phases[0]?.tasks[0]?.id).toBe('1.1');
      expect(phases[0]?.tasks[0]?.description).toBe('Initialize project repository');
      expect(phases[0]?.tasks[0]?.acceptance_criteria).toEqual([
        'Repository created',
        'Basic structure in place',
      ]);
      expect(phases[0]?.tasks[0]?.depends_on).toEqual([]);

      expect(phases[0]?.tasks[1]?.depends_on).toEqual(['1.1']);

      expect(phases[1]?.name).toBe('Core Features');
      expect(phases[1]?.tasks).toHaveLength(1);
    });

    it('should handle empty response', () => {
      const response = 'No phases here';
      const phases = parsePlanningResponse(response);

      expect(phases).toEqual([]);
    });

    it('should sort phases by number', () => {
      const response = `
<phase name="Second" number="2">
<description>Phase 2</description>
<task id="2.1">
<description>Task</description>
<acceptance_criteria>- Done</acceptance_criteria>
<depends_on></depends_on>
</task>
</phase>

<phase name="First" number="1">
<description>Phase 1</description>
<task id="1.1">
<description>Task</description>
<acceptance_criteria>- Done</acceptance_criteria>
<depends_on></depends_on>
</task>
</phase>
`;

      const phases = parsePlanningResponse(response);

      expect(phases[0]?.phase_number).toBe(1);
      expect(phases[1]?.phase_number).toBe(2);
    });
  });

  describe('parseProposedPhases', () => {
    it('should parse proposed phases', () => {
      const response = `
<proposed_phases>
Phase 1: Setup - Initialize project and infrastructure
Phase 2: Core - Build main features
Phase 3: Polish - Testing and documentation
</proposed_phases>
`;

      const phases = parseProposedPhases(response);

      expect(phases).toHaveLength(3);
      expect(phases[0]?.name).toBe('Setup');
      expect(phases[0]?.description).toBe('Initialize project and infrastructure');
      expect(phases[1]?.name).toBe('Core');
      expect(phases[2]?.name).toBe('Polish');
    });

    it('should return empty array if no tag', () => {
      const response = 'No phases';
      const phases = parseProposedPhases(response);

      expect(phases).toEqual([]);
    });
  });

  describe('isPlanningComplete', () => {
    it('should return true for complete planning', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Setup',
          description: 'Setup phase',
          status: 'pending',
          tasks: [
            {
              id: '1.1',
              description: 'Task',
              status: 'pending',
              depends_on: [],
              acceptance_criteria: ['Criterion'],
            },
          ],
        },
      ];

      expect(isPlanningComplete(phases)).toBe(true);
    });

    it('should return false for empty phases', () => {
      expect(isPlanningComplete([])).toBe(false);
    });

    it('should return false if phase has no tasks', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Empty',
          description: 'No tasks',
          status: 'pending',
          tasks: [],
        },
      ];

      expect(isPlanningComplete(phases)).toBe(false);
    });

    it('should return false if task has no acceptance criteria', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Setup',
          description: 'Setup',
          status: 'pending',
          tasks: [
            {
              id: '1.1',
              description: 'Task',
              status: 'pending',
              depends_on: [],
              acceptance_criteria: [],
            },
          ],
        },
      ];

      expect(isPlanningComplete(phases)).toBe(false);
    });
  });

  describe('getPlanningIssues', () => {
    it('should return empty for valid planning', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Setup',
          description: 'Setup',
          status: 'pending',
          tasks: [
            {
              id: '1.1',
              description: 'Task',
              status: 'pending',
              depends_on: [],
              acceptance_criteria: ['Done'],
            },
          ],
        },
      ];

      expect(getPlanningIssues(phases)).toEqual([]);
    });

    it('should report no phases', () => {
      const issues = getPlanningIssues([]);
      expect(issues).toContain('No phases defined');
    });

    it('should report phases without tasks', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Empty',
          description: 'No tasks',
          status: 'pending',
          tasks: [],
        },
      ];

      const issues = getPlanningIssues(phases);
      expect(issues.some((i) => i.includes('no tasks'))).toBe(true);
    });

    it('should report tasks without criteria', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Setup',
          description: 'Setup',
          status: 'pending',
          tasks: [
            {
              id: '1.1',
              description: 'Task',
              status: 'pending',
              depends_on: [],
              acceptance_criteria: [],
            },
          ],
        },
      ];

      const issues = getPlanningIssues(phases);
      expect(issues.some((i) => i.includes('no acceptance criteria'))).toBe(true);
    });

    it('should report missing dependencies', () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Setup',
          description: 'Setup',
          status: 'pending',
          tasks: [
            {
              id: '1.1',
              description: 'Task',
              status: 'pending',
              depends_on: ['nonexistent'],
              acceptance_criteria: ['Done'],
            },
          ],
        },
      ];

      const issues = getPlanningIssues(phases);
      expect(issues.some((i) => i.includes('non-existent task'))).toBe(true);
    });
  });
});
