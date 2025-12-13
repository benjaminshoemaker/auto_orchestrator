import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PhaseManager } from '../../../../src/lib/state/phase-manager.js';
import { StateManager } from '../../../../src/lib/state/state-manager.js';
import { DocumentManager } from '../../../../src/lib/documents.js';
import { ImplementationPhase, IdeationContent, SpecificationContent } from '../../../../src/types/index.js';
import { createTaskResult } from '../../../../src/lib/task-results.js';

describe('PhaseManager', () => {
  let tempDir: string;
  let docManager: DocumentManager;
  let stateManager: StateManager;
  let phaseManager: PhaseManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'phase-manager-test-'));
    docManager = new DocumentManager(tempDir);
    await docManager.initialize('Test Project', 'A test project');
    stateManager = new StateManager(docManager, tempDir);
    await stateManager.load();
    phaseManager = new PhaseManager(stateManager);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('getCurrentPhase', () => {
    it('should return phase 1 for new project', () => {
      const phase = phaseManager.getCurrentPhase();
      expect(phase.phase).toBe(1);
      expect(phase.name).toBe('Idea Refinement');
    });

    it('should return correct phase after transition', async () => {
      // Complete and approve phase 1
      const ideation: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['SC1'],
        constraints: { must_have: ['C1'], nice_to_have: [], out_of_scope: [] },
        raw_content: '',
      };
      stateManager.setIdeationContent(ideation);
      stateManager.approvePhase('Phase 1');
      await stateManager.save();

      await stateManager.load();
      phaseManager = new PhaseManager(stateManager);

      const phase = phaseManager.getCurrentPhase();
      expect(phase.phase).toBe(1); // Still phase 1 until proceedToNextPhase is called
    });
  });

  describe('getPhaseStatus', () => {
    it('should return not_started for empty phase', () => {
      expect(phaseManager.getPhaseStatus(2)).toBe('not_started');
    });

    it('should return complete after ideation complete', () => {
      const ideation: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['SC1'],
        constraints: { must_have: [], nice_to_have: [], out_of_scope: [] },
        raw_content: '',
      };
      stateManager.setIdeationContent(ideation);

      expect(phaseManager.getPhaseStatus(1)).toBe('complete');
    });

    it('should return approved after phase approved', () => {
      const ideation: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['SC1'],
        constraints: { must_have: [], nice_to_have: [], out_of_scope: [] },
        raw_content: '',
      };
      stateManager.setIdeationContent(ideation);
      stateManager.approvePhase('Phase 1');

      expect(phaseManager.getPhaseStatus(1)).toBe('approved');
    });
  });

  describe('isPhaseComplete', () => {
    it('should return false for incomplete phase', () => {
      expect(phaseManager.isPhaseComplete(1)).toBe(false);
    });

    it('should return true for complete phase', () => {
      const ideation: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['SC1'],
        constraints: { must_have: [], nice_to_have: [], out_of_scope: [] },
        raw_content: '',
      };
      stateManager.setIdeationContent(ideation);

      expect(phaseManager.isPhaseComplete(1)).toBe(true);
    });
  });

  describe('isPhaseApproved', () => {
    it('should return false for unapproved phase', () => {
      expect(phaseManager.isPhaseApproved(1)).toBe(false);
    });

    it('should return true for approved phase', () => {
      const ideation: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['SC1'],
        constraints: { must_have: [], nice_to_have: [], out_of_scope: [] },
        raw_content: '',
      };
      stateManager.setIdeationContent(ideation);
      stateManager.approvePhase('Phase 1');

      expect(phaseManager.isPhaseApproved(1)).toBe(true);
    });
  });

  describe('getReadinessForApproval', () => {
    describe('Phase 1 (Ideation)', () => {
      it('should show all blockers for empty ideation', () => {
        const result = phaseManager.getReadinessForApproval(1);

        expect(result.ready).toBe(false);
        expect(result.blockers).toContain('Problem statement not defined');
        expect(result.blockers).toContain('Target users not identified');
      });

      it('should pass when ideation complete', () => {
        const ideation: IdeationContent = {
          problem_statement: 'Problem',
          target_users: 'Users',
          use_cases: ['UC1', 'UC2', 'UC3'],
          success_criteria: ['SC1'],
          constraints: { must_have: ['C1'], nice_to_have: [], out_of_scope: [] },
          raw_content: '',
        };
        stateManager.setIdeationContent(ideation);

        const result = phaseManager.getReadinessForApproval(1);
        expect(result.ready).toBe(true);
        expect(result.blockers).toHaveLength(0);
      });

      it('should require at least 3 use cases', () => {
        const ideation: IdeationContent = {
          problem_statement: 'Problem',
          target_users: 'Users',
          use_cases: ['UC1', 'UC2'], // Only 2
          success_criteria: ['SC1'],
          constraints: { must_have: [], nice_to_have: [], out_of_scope: [] },
          raw_content: '',
        };
        stateManager.setIdeationContent(ideation);

        const result = phaseManager.getReadinessForApproval(1);
        expect(result.ready).toBe(false);
        expect(result.blockers.some((b) => b.includes('use cases'))).toBe(true);
      });
    });

    describe('Phase 2 (Specification)', () => {
      it('should show blockers for empty spec', () => {
        const result = phaseManager.getReadinessForApproval(2);

        expect(result.ready).toBe(false);
        expect(result.blockers).toContain('Architecture not defined');
        expect(result.blockers).toContain('Tech stack not selected');
      });

      it('should pass when spec complete', () => {
        const spec: SpecificationContent = {
          architecture: 'SPA with REST API',
          tech_stack: [{ layer: 'Frontend', choice: 'React', rationale: 'Popular' }],
          data_models: 'Task { id, title, status }',
          api_contracts: 'GET /tasks',
          ui_requirements: 'Clean UI',
          raw_content: '',
        };
        stateManager.setSpecificationContent(spec);

        const result = phaseManager.getReadinessForApproval(2);
        expect(result.ready).toBe(true);
      });
    });

    describe('Phase 3 (Planning)', () => {
      it('should fail with no implementation phases', () => {
        const result = phaseManager.getReadinessForApproval(3);

        expect(result.ready).toBe(false);
        expect(result.blockers).toContain('No implementation phases defined');
      });

      it('should fail with empty phases', () => {
        const phases: ImplementationPhase[] = [
          {
            phase_number: 1,
            name: 'Empty Phase',
            description: 'No tasks',
            status: 'pending',
            tasks: [],
          },
        ];
        stateManager.addImplementationPhases(phases);

        const result = phaseManager.getReadinessForApproval(3);
        expect(result.ready).toBe(false);
        expect(result.blockers.some((b) => b.includes('without tasks'))).toBe(true);
      });

      it('should pass with valid phases and tasks', () => {
        const phases: ImplementationPhase[] = [
          {
            phase_number: 1,
            name: 'Foundation',
            description: 'Setup',
            status: 'pending',
            tasks: [
              {
                id: '1.1',
                description: 'Task 1',
                status: 'pending',
                depends_on: [],
                acceptance_criteria: ['Works'],
              },
            ],
          },
        ];
        stateManager.addImplementationPhases(phases);

        const result = phaseManager.getReadinessForApproval(3);
        expect(result.ready).toBe(true);
      });

      it('should detect dependency issues', () => {
        const phases: ImplementationPhase[] = [
          {
            phase_number: 1,
            name: 'Bad Phase',
            description: 'Has cycle',
            status: 'pending',
            tasks: [
              {
                id: '1.1',
                description: 'Task 1',
                status: 'pending',
                depends_on: ['1.2'],
                acceptance_criteria: [],
              },
              {
                id: '1.2',
                description: 'Task 2',
                status: 'pending',
                depends_on: ['1.1'],
                acceptance_criteria: [],
              },
            ],
          },
        ];
        stateManager.addImplementationPhases(phases);

        const result = phaseManager.getReadinessForApproval(3);
        expect(result.ready).toBe(false);
        expect(result.blockers.some((b) => b.includes('Circular'))).toBe(true);
      });
    });

    describe('Implementation Phase', () => {
      beforeEach(async () => {
        // Use docManager to add phases so they persist to file
        const phase: ImplementationPhase = {
          phase_number: 1,
          name: 'Foundation',
          description: 'Setup',
          status: 'pending',
          tasks: [
            {
              id: '1.1',
              description: 'Task 1',
              status: 'pending',
              depends_on: [],
              acceptance_criteria: [],
            },
            {
              id: '1.2',
              description: 'Task 2',
              status: 'pending',
              depends_on: [],
              acceptance_criteria: [],
            },
          ],
        };
        await docManager.addImplementationPhase(phase);
        await docManager.updateProjectMeta({
          current_phase: 'implementation',
          current_phase_name: 'Implementation',
          implementation: {
            total_phases: 1,
            completed_phases: 0,
            current_impl_phase: 1,
            current_impl_phase_name: 'Foundation',
          },
        });
        await stateManager.load();
        phaseManager = new PhaseManager(stateManager);
      });

      it('should fail with pending tasks', () => {
        const result = phaseManager.getReadinessForApproval('implementation');

        expect(result.ready).toBe(false);
        expect(result.blockers.some((b) => b.includes('pending'))).toBe(true);
      });

      it('should fail with failed tasks', () => {
        const result = createTaskResult('1.1', 'Task 1');
        result.status = 'failed';
        result.failure_reason = 'Error';
        stateManager.startTask('1.1');
        stateManager.failTask('1.1', result);

        const readiness = phaseManager.getReadinessForApproval('implementation');
        expect(readiness.ready).toBe(false);
        expect(readiness.blockers.some((b) => b.includes('failed'))).toBe(true);
      });

      it('should pass with all tasks complete', () => {
        const result1 = createTaskResult('1.1', 'Task 1');
        result1.status = 'success';
        stateManager.startTask('1.1');
        stateManager.completeTask('1.1', result1);

        const result2 = createTaskResult('1.2', 'Task 2');
        result2.status = 'success';
        stateManager.startTask('1.2');
        stateManager.completeTask('1.2', result2);

        const readiness = phaseManager.getReadinessForApproval('implementation');
        expect(readiness.ready).toBe(true);
      });
    });
  });

  describe('canProceedToNextPhase', () => {
    it('should return false if not approved', () => {
      const result = phaseManager.canProceedToNextPhase();
      expect(result.canProceed).toBe(false);
      expect(result.reason).toContain('approved');
    });

    it('should return true after approval', () => {
      const ideation: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['SC1'],
        constraints: { must_have: [], nice_to_have: [], out_of_scope: [] },
        raw_content: '',
      };
      stateManager.setIdeationContent(ideation);
      stateManager.approvePhase('Phase 1');

      const result = phaseManager.canProceedToNextPhase();
      expect(result.canProceed).toBe(true);
    });
  });

  describe('proceedToNextPhase', () => {
    it('should transition from phase 1 to phase 2', async () => {
      const ideation: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['SC1'],
        constraints: { must_have: [], nice_to_have: [], out_of_scope: [] },
        raw_content: '',
      };
      stateManager.setIdeationContent(ideation);
      stateManager.approvePhase('Phase 1');

      await phaseManager.proceedToNextPhase();

      const meta = stateManager.getMeta();
      expect(meta.current_phase).toBe(2);
      expect(meta.current_phase_name).toBe('Specification');
    });

    it('should throw if not approved', async () => {
      await expect(phaseManager.proceedToNextPhase()).rejects.toThrow('approved');
    });
  });

  describe('getCurrentImplPhaseNumber', () => {
    it('should return null if not in implementation', () => {
      expect(phaseManager.getCurrentImplPhaseNumber()).toBeNull();
    });

    it('should return phase number in implementation', async () => {
      const phases: ImplementationPhase[] = [
        {
          phase_number: 1,
          name: 'Foundation',
          description: 'Setup',
          status: 'pending',
          tasks: [],
        },
      ];
      stateManager.addImplementationPhases(phases);
      await docManager.updateProjectMeta({
        current_phase: 'implementation',
        current_phase_name: 'Implementation',
        implementation: {
          total_phases: 1,
          completed_phases: 0,
          current_impl_phase: 1,
          current_impl_phase_name: 'Foundation',
        },
      });
      await stateManager.load();
      phaseManager = new PhaseManager(stateManager);

      expect(phaseManager.getCurrentImplPhaseNumber()).toBe(1);
    });
  });

  describe('isCurrentImplPhaseComplete', () => {
    beforeEach(async () => {
      // Use docManager to add phase so it persists to file
      const phase: ImplementationPhase = {
        phase_number: 1,
        name: 'Foundation',
        description: 'Setup',
        status: 'pending',
        tasks: [
          {
            id: '1.1',
            description: 'Task 1',
            status: 'pending',
            depends_on: [],
            acceptance_criteria: [],
          },
        ],
      };
      await docManager.addImplementationPhase(phase);
      await docManager.updateProjectMeta({
        current_phase: 'implementation',
        current_phase_name: 'Implementation',
        implementation: {
          total_phases: 1,
          completed_phases: 0,
          current_impl_phase: 1,
          current_impl_phase_name: 'Foundation',
        },
      });
      await stateManager.load();
      phaseManager = new PhaseManager(stateManager);
    });

    it('should return false with pending tasks', () => {
      expect(phaseManager.isCurrentImplPhaseComplete()).toBe(false);
    });

    it('should return false with failed tasks', () => {
      const result = createTaskResult('1.1', 'Task 1');
      result.status = 'failed';
      stateManager.startTask('1.1');
      stateManager.failTask('1.1', result);

      expect(phaseManager.isCurrentImplPhaseComplete()).toBe(false);
    });

    it('should return true with all complete tasks', () => {
      const result = createTaskResult('1.1', 'Task 1');
      result.status = 'success';
      stateManager.startTask('1.1');
      stateManager.completeTask('1.1', result);

      expect(phaseManager.isCurrentImplPhaseComplete()).toBe(true);
    });
  });

  describe('advanceImplPhase', () => {
    beforeEach(async () => {
      // Use docManager to add phases so they persist to file
      const phase1: ImplementationPhase = {
        phase_number: 1,
        name: 'Foundation',
        description: 'Setup',
        status: 'pending',
        tasks: [],
      };
      const phase2: ImplementationPhase = {
        phase_number: 2,
        name: 'Features',
        description: 'Build features',
        status: 'pending',
        tasks: [],
      };
      await docManager.addImplementationPhase(phase1);
      await docManager.addImplementationPhase(phase2);
      await docManager.updateProjectMeta({
        current_phase: 'implementation',
        current_phase_name: 'Implementation',
        implementation: {
          total_phases: 2,
          completed_phases: 0,
          current_impl_phase: 1,
          current_impl_phase_name: 'Foundation',
        },
      });
      await stateManager.load();
      phaseManager = new PhaseManager(stateManager);
    });

    it('should advance to next phase', () => {
      phaseManager.advanceImplPhase();

      const meta = stateManager.getMeta();
      expect(meta.implementation?.current_impl_phase).toBe(2);
      expect(meta.implementation?.current_impl_phase_name).toBe('Features');
      expect(meta.implementation?.completed_phases).toBe(1);
    });

    it('should throw when no more phases', () => {
      phaseManager.advanceImplPhase(); // Go to phase 2

      expect(() => phaseManager.advanceImplPhase()).toThrow('No more');
    });
  });
});
