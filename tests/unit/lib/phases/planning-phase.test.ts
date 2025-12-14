import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PlanningPhase,
  type PlanningInput,
} from '../../../../src/lib/phases/planning-phase.js';
import type { PhaseRunnerConfig } from '../../../../src/lib/phases/phase-runner.js';
import type {
  IdeationContent,
  SpecificationContent,
  ImplementationPhase,
  Task,
} from '../../../../src/types/index.js';

// Mock the terminal module
vi.mock('../../../../src/lib/ui/terminal.js', () => ({
  printHeader: vi.fn(),
  printSection: vi.fn(),
  printInfo: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printWarning: vi.fn(),
  printAssistantMessage: vi.fn(),
  printUserPrompt: vi.fn(() => '> '),
  prompt: vi.fn(),
  endStream: vi.fn(),
}));

import * as terminal from '../../../../src/lib/ui/terminal.js';

describe('PlanningPhase', () => {
  let mockConfig: PhaseRunnerConfig;
  let mockConversation: {
    getHistory: ReturnType<typeof vi.fn>;
    getTokenUsage: ReturnType<typeof vi.fn>;
    calculateCost: ReturnType<typeof vi.fn>;
  };
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  const sampleIdeationContent: IdeationContent = {
    problem_statement: 'Users need task management',
    target_users: 'Professionals',
    use_cases: ['Create task', 'Complete task'],
    success_criteria: ['Fast task creation'],
    constraints: {
      must_have: ['Mobile'],
      nice_to_have: [],
      out_of_scope: [],
    },
    raw_content: 'raw',
  };

  const sampleSpecContent: SpecificationContent = {
    architecture: 'Microservices with REST API',
    tech_stack: [
      { layer: 'Frontend', choice: 'React', rationale: 'Popular' },
    ],
    data_models: 'Task { id, title }',
    api_design: 'REST CRUD',
    raw_content: 'raw',
  };

  const sampleTask: Task = {
    id: '1.1',
    description: 'Set up project structure',
    acceptance_criteria: ['package.json exists'],
    depends_on: [],
    status: 'pending',
  };

  const samplePhases: ImplementationPhase[] = [
    {
      phase_number: 1,
      name: 'Setup',
      description: 'Project setup phase',
      tasks: [sampleTask],
    },
    {
      phase_number: 2,
      name: 'Core Features',
      description: 'Build core features',
      tasks: [
        {
          id: '2.1',
          description: 'Create task model',
          acceptance_criteria: ['Model works'],
          depends_on: ['1.1'],
          status: 'pending',
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockConversation = {
      getHistory: vi.fn(() => []),
      getTokenUsage: vi.fn(() => ({
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        turnCount: 3,
      })),
      calculateCost: vi.fn(() => 1.0),
    };

    mockConfig = {
      llmService: {
        startPlanning: vi.fn().mockResolvedValue({
          response: 'Let me create a plan...',
          conversation: mockConversation,
        }),
        continuePlanning: vi.fn().mockResolvedValue('Got it, continuing...'),
        completePlanning: vi.fn().mockResolvedValue({
          content: samplePhases,
          tokensUsed: 300,
          costUsd: 1.0,
          turnCount: 3,
        }),
      } as unknown as PhaseRunnerConfig['llmService'],
      stateManager: {
        addImplementationPhases: vi.fn(),
        getMeta: vi.fn(() => ({
          current_phase: 3,
          phase_status: 'in_progress',
          gates: { planning_complete: false },
          cost: { total_tokens: 0, total_cost_usd: 0 },
        })),
        getProject: vi.fn(() => ({
          meta: {},
          ideation: sampleIdeationContent,
          specification: sampleSpecContent,
          implementation_phases: [],
        })),
        addCost: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined),
      } as unknown as PhaseRunnerConfig['stateManager'],
      documentManager: {} as PhaseRunnerConfig['documentManager'],
    };

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('phase identification', () => {
    it('should be phase 3', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ specification: sampleSpecContent });

      expect(terminal.printHeader).toHaveBeenCalledWith(
        expect.stringContaining('Phase 3')
      );
    });

    it('should have name "Implementation Planning"', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ specification: sampleSpecContent });

      expect(terminal.printHeader).toHaveBeenCalledWith(
        expect.stringContaining('Implementation Planning')
      );
    });
  });

  describe('setup', () => {
    it('should display architecture', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ specification: sampleSpecContent });

      expect(terminal.printSection).toHaveBeenCalledWith(
        'Architecture',
        'Microservices with REST API'
      );
    });
  });

  describe('conversation flow', () => {
    it('should start planning with spec and ideation', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({
        specification: sampleSpecContent,
        projectName: 'test-project',
      });

      expect(mockConfig.llmService.startPlanning).toHaveBeenCalledWith(
        'test-project',
        sampleIdeationContent,
        sampleSpecContent
      );
    });

    it('should require ideation content', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      // Mock getProject to return no ideation
      vi.mocked(mockConfig.stateManager.getProject).mockReturnValueOnce({
        meta: {},
        ideation: null,
        specification: sampleSpecContent,
        implementation_phases: [],
      } as any);

      const result = await phase.run({ specification: sampleSpecContent });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Ideation');
    });
  });

  describe('dependency validation', () => {
    it('should validate dependencies', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ specification: sampleSpecContent });

      // Should complete without throwing
      expect(mockConfig.llmService.completePlanning).toHaveBeenCalled();
    });

    it('should warn about invalid dependencies', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      // Create phases with circular dependency
      const circularPhases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Phase 1',
          description: 'desc',
          tasks: [
            {
              id: '1.1',
              description: 'Task 1',
              acceptance_criteria: ['Criterion 1'],
              depends_on: ['1.2'], // Depends on task below
              status: 'pending',
            },
            {
              id: '1.2',
              description: 'Task 2',
              acceptance_criteria: ['Criterion 2'],
              depends_on: ['1.1'], // Circular!
              status: 'pending',
            },
          ],
        },
      ];

      vi.mocked(mockConfig.llmService.completePlanning).mockResolvedValueOnce({
        content: circularPhases,
        tokensUsed: 100,
        costUsd: 0.5,
        turnCount: 1,
      });

      await phase.run({ specification: sampleSpecContent });

      expect(terminal.printWarning).toHaveBeenCalledWith(
        expect.stringContaining('Dependency issues')
      );
    });
  });

  describe('persistence', () => {
    it('should add implementation phases to state', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ specification: sampleSpecContent });

      expect(mockConfig.stateManager.addImplementationPhases).toHaveBeenCalledWith(
        samplePhases
      );
    });

    it('should show plan summary', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ specification: sampleSpecContent });

      expect(terminal.printSection).toHaveBeenCalledWith(
        'Implementation Plan',
        ''
      );
      // Summary is printed via console.log
      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Phase 1');
      expect(calls).toContain('Setup');
    });
  });

  describe('result', () => {
    it('should return success with phases', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      const result = await phase.run({ specification: sampleSpecContent });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(samplePhases);
    });

    it('should return cost', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      const result = await phase.run({ specification: sampleSpecContent });

      expect(result.cost).toBe(1.0);
    });

    it('should count total tasks', async () => {
      const phase = new PlanningPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ specification: sampleSpecContent });

      // Should show summary with task counts
      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('2 phases');
      expect(calls).toContain('2 tasks');
    });
  });
});
