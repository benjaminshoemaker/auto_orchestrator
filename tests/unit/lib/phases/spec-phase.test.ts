import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SpecPhase,
  type SpecInput,
} from '../../../../src/lib/phases/spec-phase.js';
import type { PhaseRunnerConfig } from '../../../../src/lib/phases/phase-runner.js';
import type {
  IdeationContent,
  SpecificationContent,
} from '../../../../src/types/index.js';

// Mock the terminal module
vi.mock('../../../../src/lib/ui/terminal.js', () => ({
  printHeader: vi.fn(),
  printSection: vi.fn(),
  printInfo: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printAssistantMessage: vi.fn(),
  printUserPrompt: vi.fn(() => '> '),
  prompt: vi.fn(),
  endStream: vi.fn(),
}));

import * as terminal from '../../../../src/lib/ui/terminal.js';

describe('SpecPhase', () => {
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
      { layer: 'Backend', choice: 'Node.js', rationale: 'Fast' },
    ],
    data_models: 'Task { id, title, completed }',
    api_design: 'REST endpoints for CRUD',
    raw_content: 'raw',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockConversation = {
      getHistory: vi.fn(() => []),
      getTokenUsage: vi.fn(() => ({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        turnCount: 2,
      })),
      calculateCost: vi.fn(() => 0.75),
    };

    mockConfig = {
      llmService: {
        startSpecification: vi.fn().mockResolvedValue({
          response: 'Let me create a specification...',
          conversation: mockConversation,
        }),
        continueSpecification: vi.fn().mockResolvedValue('Tell me more...'),
        completeSpecification: vi.fn().mockResolvedValue({
          content: sampleSpecContent,
          tokensUsed: 150,
          costUsd: 0.75,
          turnCount: 2,
        }),
      } as unknown as PhaseRunnerConfig['llmService'],
      stateManager: {
        setSpecificationContent: vi.fn(),
        getMeta: vi.fn(() => ({
          current_phase: 2,
          phase_status: 'in_progress',
          gates: { spec_complete: false },
          cost: { total_tokens: 0, total_cost_usd: 0 },
        })),
        getProject: vi.fn(() => ({
          meta: {},
          ideation: sampleIdeationContent,
          specification: null,
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
    it('should be phase 2', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ ideation: sampleIdeationContent });

      expect(terminal.printHeader).toHaveBeenCalledWith(
        expect.stringContaining('Phase 2')
      );
    });

    it('should have name "Specification"', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ ideation: sampleIdeationContent });

      expect(terminal.printHeader).toHaveBeenCalledWith(
        expect.stringContaining('Specification')
      );
    });
  });

  describe('setup', () => {
    it('should display ideation summary', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ ideation: sampleIdeationContent });

      expect(terminal.printSection).toHaveBeenCalledWith(
        'From Phase 1',
        expect.any(String)
      );
    });
  });

  describe('conversation flow', () => {
    it('should start specification with ideation', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({
        ideation: sampleIdeationContent,
        projectName: 'test-project',
      });

      expect(mockConfig.llmService.startSpecification).toHaveBeenCalledWith(
        'test-project',
        sampleIdeationContent
      );
    });

    it('should continue with user input', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt)
        .mockResolvedValueOnce('Use TypeScript')
        .mockResolvedValueOnce('/complete');

      await phase.run({ ideation: sampleIdeationContent });

      expect(mockConfig.llmService.continueSpecification).toHaveBeenCalledWith(
        expect.anything(),
        'Use TypeScript',
        undefined
      );
    });
  });

  describe('persistence', () => {
    it('should set specification content', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ ideation: sampleIdeationContent });

      expect(mockConfig.stateManager.setSpecificationContent).toHaveBeenCalledWith(
        sampleSpecContent
      );
    });

    it('should display tech stack summary', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ ideation: sampleIdeationContent });

      expect(terminal.printSection).toHaveBeenCalledWith(
        'Tech Stack',
        expect.stringContaining('Frontend')
      );
    });
  });

  describe('result', () => {
    it('should return success with spec content', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      const result = await phase.run({ ideation: sampleIdeationContent });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleSpecContent);
    });

    it('should return cost', async () => {
      const phase = new SpecPhase(mockConfig);
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      const result = await phase.run({ ideation: sampleIdeationContent });

      expect(result.cost).toBe(0.75);
    });
  });
});
