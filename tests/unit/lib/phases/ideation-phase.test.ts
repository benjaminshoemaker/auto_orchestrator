import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IdeationPhase,
  type IdeationInput,
} from '../../../../src/lib/phases/ideation-phase.js';
import type { PhaseRunnerConfig } from '../../../../src/lib/phases/phase-runner.js';
import type { IdeationContent } from '../../../../src/types/index.js';

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

// Get the mocked terminal module
import * as terminal from '../../../../src/lib/ui/terminal.js';

describe('IdeationPhase', () => {
  let mockConfig: PhaseRunnerConfig;
  let mockConversation: {
    getHistory: ReturnType<typeof vi.fn>;
    getTokenUsage: ReturnType<typeof vi.fn>;
    calculateCost: ReturnType<typeof vi.fn>;
  };
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  const sampleIdeationContent: IdeationContent = {
    problem_statement: 'Users need a simple way to manage their tasks',
    target_users: 'Busy professionals who need task management',
    use_cases: [
      'Create a new task',
      'Mark task as complete',
      'View all tasks',
    ],
    success_criteria: [
      'User can create tasks in under 5 seconds',
      'All tasks sync across devices',
    ],
    constraints: {
      must_have: ['Mobile support'],
      nice_to_have: ['Dark mode'],
      out_of_scope: ['Calendar integration'],
    },
    raw_content: 'Raw ideation content',
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    mockConversation = {
      getHistory: vi.fn(() => [
        { role: 'user', content: 'test input' },
        { role: 'assistant', content: 'test response' },
      ]),
      getTokenUsage: vi.fn(() => ({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        turnCount: 2,
      })),
      calculateCost: vi.fn(() => 0.5),
    };

    mockConfig = {
      llmService: {
        startIdeation: vi.fn().mockResolvedValue({
          response: 'Let me help you refine your idea...',
          conversation: mockConversation,
        }),
        continueIdeation: vi.fn().mockResolvedValue('Great, tell me more...'),
        completeIdeation: vi.fn().mockResolvedValue({
          content: sampleIdeationContent,
          tokensUsed: 150,
          costUsd: 0.5,
          turnCount: 2,
        }),
      } as unknown as PhaseRunnerConfig['llmService'],
      stateManager: {
        setIdeationContent: vi.fn(),
        getMeta: vi.fn(() => ({
          current_phase: 1,
          phase_status: 'in_progress',
          gates: {
            ideation_complete: false,
            ideation_approved: false,
          },
          cost: { total_tokens: 0, total_cost_usd: 0 },
        })),
        getProject: vi.fn(() => ({
          meta: {
            current_phase: 1,
            phase_status: 'in_progress',
            gates: { ideation_complete: false },
          },
          ideation: null,
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
    it('should be phase 1', async () => {
      const phase = new IdeationPhase(mockConfig);

      // Mock prompt to immediately complete
      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      const result = await phase.run({ idea: 'test idea' });

      // Check header was called with Phase 1
      expect(terminal.printHeader).toHaveBeenCalledWith(
        expect.stringContaining('Phase 1')
      );
    });

    it('should have name "Idea Refinement"', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'test idea' });

      expect(terminal.printHeader).toHaveBeenCalledWith(
        expect.stringContaining('Idea Refinement')
      );
    });
  });

  describe('setup', () => {
    it('should display the idea', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'Build a todo app' });

      expect(terminal.printSection).toHaveBeenCalledWith(
        'Your Idea',
        'Build a todo app'
      );
    });

    it('should show help message', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'test' });

      expect(terminal.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('/quit')
      );
    });
  });

  describe('conversation flow', () => {
    it('should start ideation with project name and idea', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'Build a todo app', projectName: 'my-todo' });

      expect(mockConfig.llmService.startIdeation).toHaveBeenCalledWith(
        'my-todo',
        'Build a todo app'
      );
    });

    it('should use "project" as default project name', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'Build a todo app' });

      expect(mockConfig.llmService.startIdeation).toHaveBeenCalledWith(
        'project',
        'Build a todo app'
      );
    });

    it('should display initial assistant message', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'test' });

      expect(terminal.printAssistantMessage).toHaveBeenCalledWith(
        'Let me help you refine your idea...'
      );
    });

    it('should continue conversation with user input', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt)
        .mockResolvedValueOnce('I want it to be simple')
        .mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'test' });

      expect(mockConfig.llmService.continueIdeation).toHaveBeenCalledWith(
        expect.anything(),
        'I want it to be simple',
        undefined
      );
    });

    it('should allow /quit to cancel', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/quit');

      const result = await phase.run({ idea: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');
    });

    it('should allow /done as alternative to /complete', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/done');

      const result = await phase.run({ idea: 'test' });

      expect(result.success).toBe(true);
      expect(mockConfig.llmService.completeIdeation).toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('should set ideation content on state manager', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'test' });

      expect(mockConfig.stateManager.setIdeationContent).toHaveBeenCalledWith(
        sampleIdeationContent
      );
    });

    it('should add cost to state manager', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'test' });

      expect(mockConfig.stateManager.addCost).toHaveBeenCalledWith(0, 0.5);
    });

    it('should save state after completion', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'test' });

      expect(mockConfig.stateManager.save).toHaveBeenCalled();
    });
  });

  describe('result', () => {
    it('should return success with ideation content', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      const result = await phase.run({ idea: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleIdeationContent);
    });

    it('should return cost in result', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      const result = await phase.run({ idea: 'test' });

      expect(result.cost).toBe(0.5);
    });

    it('should display summary on completion', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      await phase.run({ idea: 'test' });

      expect(terminal.printSection).toHaveBeenCalledWith(
        'Summary',
        expect.stringContaining('Problem:')
      );
    });
  });

  describe('error handling', () => {
    it('should handle LLM service errors', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(mockConfig.llmService.startIdeation).mockRejectedValueOnce(
        new Error('API error')
      );

      const result = await phase.run({ idea: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API error');
    });

    it('should handle incomplete ideation content', async () => {
      const phase = new IdeationPhase(mockConfig);

      vi.mocked(mockConfig.llmService.completeIdeation).mockResolvedValueOnce({
        content: {
          problem_statement: 'test',
          // Missing required fields
        } as unknown as IdeationContent,
        tokensUsed: 100,
        costUsd: 0.3,
        turnCount: 1,
      });

      vi.mocked(terminal.prompt).mockResolvedValueOnce('/complete');

      const result = await phase.run({ idea: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('incomplete');
    });
  });
});
