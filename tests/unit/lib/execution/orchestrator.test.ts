import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Orchestrator,
  type OrchestratorEvent,
} from '../../../../src/lib/execution/orchestrator.js';
import type { ImplementationPhase } from '../../../../src/types/index.js';

// Mock PhaseExecutor
vi.mock('../../../../src/lib/execution/phase-executor.js', () => ({
  PhaseExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      phaseNumber: 1,
      phaseName: 'Setup',
      success: true,
      tasksCompleted: 2,
      tasksFailed: 0,
      tasksSkipped: 0,
      totalDuration: 5000,
      results: [],
    }),
    setSpecification: vi.fn(),
    on: vi.fn(),
  })),
}));

// Mock terminal
vi.mock('../../../../src/lib/ui/terminal.js', () => ({
  printHeader: vi.fn(),
  printInfo: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printWarning: vi.fn(),
  formatDuration: vi.fn((s) => `${s}s`),
  confirm: vi.fn().mockResolvedValue(true),
}));

import { PhaseExecutor } from '../../../../src/lib/execution/phase-executor.js';
import * as terminal from '../../../../src/lib/ui/terminal.js';

describe('Orchestrator', () => {
  const samplePhase: ImplementationPhase = {
    phase_number: 1,
    name: 'Setup',
    description: 'Initial setup',
    tasks: [
      {
        id: '1.1',
        description: 'Task 1',
        acceptance_criteria: [],
        depends_on: [],
        status: 'pending',
      },
    ],
  };

  let mockStateManager: {
    getProject: ReturnType<typeof vi.fn>;
    getMeta: ReturnType<typeof vi.fn>;
    approvePhase: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  let mockDocumentManager: {};

  beforeEach(() => {
    vi.clearAllMocks();

    mockStateManager = {
      getProject: vi.fn().mockReturnValue({
        implementation_phases: [samplePhase],
        specification: {
          architecture: 'Test arch',
          tech_stack: [],
        },
      }),
      getMeta: vi.fn().mockReturnValue({
        project_name: 'test-project',
        implementation: {
          current_impl_phase: 1,
        },
      }),
      approvePhase: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    mockDocumentManager = {};
  });

  describe('constructor', () => {
    it('should create orchestrator with default options', () => {
      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );
      expect(orchestrator).toBeDefined();
    });

    it('should accept custom options', () => {
      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any,
        {
          dryRun: true,
          startPhase: 2,
          endPhase: 5,
        }
      );
      expect(orchestrator).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute all phases', async () => {
      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );

      const result = await orchestrator.execute();

      expect(result.phasesCompleted).toBe(1);
      expect(result.success).toBe(true);
    });

    it('should create PhaseExecutor with options', async () => {
      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any,
        {
          timeout: 60000,
          maxRetries: 3,
        }
      );

      await orchestrator.execute();

      expect(PhaseExecutor).toHaveBeenCalled();
    });

    it('should set specification on phase executor', async () => {
      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );

      await orchestrator.execute();

      const mockExecutor = vi.mocked(PhaseExecutor).mock.results[0].value;
      expect(mockExecutor.setSpecification).toHaveBeenCalled();
    });

    it('should emit events during execution', async () => {
      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );

      const events: OrchestratorEvent[] = [];
      orchestrator.on('event', (e) => events.push(e));

      await orchestrator.execute();

      expect(events.some((e) => e.type === 'orchestration_start')).toBe(true);
      expect(events.some((e) => e.type === 'orchestration_complete')).toBe(true);
    });

    it('should approve phase after completion', async () => {
      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );

      await orchestrator.execute();

      expect(mockStateManager.approvePhase).toHaveBeenCalledWith('impl-1');
      expect(mockStateManager.save).toHaveBeenCalled();
    });

    it('should handle phase failure', async () => {
      vi.mocked(PhaseExecutor).mockImplementationOnce(
        () =>
          ({
            execute: vi.fn().mockResolvedValue({
              phaseNumber: 1,
              phaseName: 'Setup',
              success: false,
              tasksCompleted: 0,
              tasksFailed: 1,
              tasksSkipped: 0,
              totalDuration: 1000,
              results: [],
            }),
            setSpecification: vi.fn(),
            on: vi.fn(),
          }) as any
      );

      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );

      const result = await orchestrator.execute();

      expect(result.success).toBe(false);
      expect(result.phasesFailed).toBe(1);
    });

    it('should stop on failure when configured', async () => {
      mockStateManager.getProject.mockReturnValueOnce({
        implementation_phases: [
          samplePhase,
          { ...samplePhase, phase_number: 2, name: 'Phase 2' },
        ],
        specification: {},
      });

      vi.mocked(PhaseExecutor).mockImplementationOnce(
        () =>
          ({
            execute: vi.fn().mockResolvedValue({
              phaseNumber: 1,
              phaseName: 'Setup',
              success: false,
              tasksCompleted: 0,
              tasksFailed: 1,
              tasksSkipped: 0,
              totalDuration: 1000,
              results: [],
            }),
            setSpecification: vi.fn(),
            on: vi.fn(),
          }) as any
      );

      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any,
        { stopOnFailure: true }
      );

      const result = await orchestrator.execute();

      // Should only have executed 1 phase
      expect(result.phasesCompleted).toBe(0);
      expect(result.phasesFailed).toBe(1);
    });

    it('should handle dry run', async () => {
      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any,
        { dryRun: true }
      );

      const result = await orchestrator.execute();

      expect(result.phasesCompleted).toBe(1);
      // PhaseExecutor.execute should not be called in dry run
      const mockExecutor = vi.mocked(PhaseExecutor).mock.results[0]?.value;
      expect(mockExecutor?.execute).not.toHaveBeenCalled();
    });

    it('should filter phases by start/end phase', async () => {
      mockStateManager.getProject.mockReturnValueOnce({
        implementation_phases: [
          samplePhase,
          { ...samplePhase, phase_number: 2, name: 'Phase 2' },
          { ...samplePhase, phase_number: 3, name: 'Phase 3' },
        ],
        specification: {},
      });

      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any,
        { startPhase: 2, endPhase: 2 }
      );

      const result = await orchestrator.execute();

      expect(result.phasesCompleted).toBe(1);
    });

    it('should handle no phases to execute', async () => {
      mockStateManager.getProject.mockReturnValueOnce({
        implementation_phases: [],
        specification: {},
      });

      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );

      const result = await orchestrator.execute();

      expect(result.success).toBe(true);
      expect(result.phasesCompleted).toBe(0);
      expect(terminal.printWarning).toHaveBeenCalledWith(
        expect.stringContaining('No phases')
      );
    });
  });

  describe('resume', () => {
    it('should resume from current phase', async () => {
      mockStateManager.getMeta.mockReturnValueOnce({
        project_name: 'test-project',
        implementation: {
          current_impl_phase: 2,
        },
      });

      mockStateManager.getProject.mockReturnValueOnce({
        implementation_phases: [
          samplePhase,
          { ...samplePhase, phase_number: 2, name: 'Phase 2' },
        ],
        specification: {},
      });

      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );

      const result = await orchestrator.resume();

      // Should have only executed phase 2
      expect(result.phasesCompleted).toBe(1);
    });
  });

  describe('abort', () => {
    it('should stop execution when aborted', async () => {
      mockStateManager.getProject.mockReturnValueOnce({
        implementation_phases: [
          samplePhase,
          { ...samplePhase, phase_number: 2 },
        ],
        specification: {},
      });

      const orchestrator = new Orchestrator(
        mockStateManager as any,
        mockDocumentManager as any
      );

      // Abort after first event
      orchestrator.on('event', () => {
        orchestrator.abort();
      });

      const result = await orchestrator.execute();

      // Should have stopped early
      expect(result.phasesCompleted).toBeLessThanOrEqual(1);
    });
  });
});
