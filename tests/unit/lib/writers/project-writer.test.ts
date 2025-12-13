import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  writeProjectMd,
  updateProjectMeta,
  updateProjectTask,
  updateProjectApproval,
  addImplementationPhase,
} from '../../../../src/lib/writers/project-writer.js';
import { parseProjectMd } from '../../../../src/lib/parsers/project-parser.js';
import { ProjectDocument, ImplementationPhase } from '../../../../src/types/index.js';

describe('Project Writer', () => {
  let sampleContent: string;
  let sampleDoc: ProjectDocument;

  beforeAll(async () => {
    const fixturePath = path.resolve(__dirname, '../../../fixtures/sample-project.md');
    sampleContent = await fs.readFile(fixturePath, 'utf-8');
    sampleDoc = parseProjectMd(sampleContent);
  });

  describe('writeProjectMd', () => {
    it('should write complete document', () => {
      const output = writeProjectMd(sampleDoc);

      expect(output).toContain('---');
      expect(output).toContain('project_name: "Test Todo App"');
      expect(output).toContain('# Test Todo App');
    });

    it('should preserve meta fields', () => {
      const output = writeProjectMd(sampleDoc);

      expect(output).toContain('version: 1');
      expect(output).toContain('project_id: "test-project-abc123"');
      expect(output).toContain('current_phase: 3');
    });

    it('should write ideation section', () => {
      const output = writeProjectMd(sampleDoc);

      expect(output).toContain('## Phase 1: Idea Refinement');
      expect(output).toContain('### Problem Statement');
      expect(output).toContain('### Use Cases');
    });

    it('should write specification section', () => {
      const output = writeProjectMd(sampleDoc);

      expect(output).toContain('## Phase 2: Specification');
      expect(output).toContain('### Tech Stack');
      expect(output).toContain('| Frontend | React |');
    });

    it('should write implementation phases', () => {
      const output = writeProjectMd(sampleDoc);

      expect(output).toContain('## Implementation Phases');
      expect(output).toContain('### Phase 1: Foundation');
      expect(output).toContain('### Phase 2: Core Features');
    });

    it('should write task tables', () => {
      const output = writeProjectMd(sampleDoc);

      expect(output).toContain('| ID | Description | Status | Depends On |');
      expect(output).toContain('| 1.1 |');
      expect(output).toContain('✅ complete');
    });

    it('should write approvals section', () => {
      const output = writeProjectMd(sampleDoc);

      expect(output).toContain('## Approvals');
      expect(output).toContain('| Phase 1 | approved |');
      expect(output).toContain('| Phase 3 | pending |');
    });

    it('should round-trip correctly', () => {
      const output = writeProjectMd(sampleDoc);
      const reparsed = parseProjectMd(output);

      // Meta fields
      expect(reparsed.meta.project_name).toBe(sampleDoc.meta.project_name);
      expect(reparsed.meta.project_id).toBe(sampleDoc.meta.project_id);
      expect(reparsed.meta.version).toBe(sampleDoc.meta.version);
      expect(reparsed.meta.current_phase).toBe(sampleDoc.meta.current_phase);
      expect(reparsed.meta.phase_status).toBe(sampleDoc.meta.phase_status);

      // Implementation phases
      expect(reparsed.implementation_phases.length).toBe(sampleDoc.implementation_phases.length);

      // Check first phase and its tasks
      if (sampleDoc.implementation_phases.length > 0 && reparsed.implementation_phases.length > 0) {
        const originalPhase = sampleDoc.implementation_phases[0];
        const reparsedPhase = reparsed.implementation_phases[0];

        expect(reparsedPhase.phase_number).toBe(originalPhase.phase_number);
        expect(reparsedPhase.name).toBe(originalPhase.name);
        expect(reparsedPhase.tasks.length).toBe(originalPhase.tasks.length);

        // Check first task details
        if (originalPhase.tasks.length > 0) {
          const originalTask = originalPhase.tasks[0];
          const reparsedTask = reparsedPhase.tasks[0];

          expect(reparsedTask.id).toBe(originalTask.id);
          expect(reparsedTask.description).toBe(originalTask.description);
          expect(reparsedTask.status).toBe(originalTask.status);
          expect(reparsedTask.depends_on).toEqual(originalTask.depends_on);
          expect(reparsedTask.acceptance_criteria).toEqual(originalTask.acceptance_criteria);
        }
      }

      // Approvals
      expect(reparsed.approvals.length).toBe(sampleDoc.approvals.length);
    });
  });

  describe('updateProjectMeta', () => {
    it('should update specific meta fields', () => {
      const updated = updateProjectMeta(sampleContent, {
        phase_status: 'in_progress',
        current_phase: 'implementation',
      });

      expect(updated).toContain('phase_status: "in_progress"');
      expect(updated).toContain('current_phase: "implementation"');
      // Should preserve other fields
      expect(updated).toContain('project_name: "Test Todo App"');
    });

    it('should update nested fields', () => {
      const updated = updateProjectMeta(sampleContent, {
        cost: {
          total_tokens: 25000,
          total_cost_usd: 0.75,
        },
      });

      expect(updated).toContain('total_tokens: 25000');
      expect(updated).toContain('total_cost_usd: 0.75');
    });
  });

  describe('updateProjectTask', () => {
    it('should update task status', () => {
      const updated = updateProjectTask(sampleContent, '1.3', {
        status: 'complete',
      });

      const doc = parseProjectMd(updated);
      const task = doc.implementation_phases[0]?.tasks.find((t) => t.id === '1.3');

      expect(task?.status).toBe('complete');
    });

    it('should update multiple task fields', () => {
      const updated = updateProjectTask(sampleContent, '2.1', {
        status: 'in_progress',
        started_at: '2024-01-20T10:00:00Z',
      });

      const doc = parseProjectMd(updated);
      const task = doc.implementation_phases[1]?.tasks.find((t) => t.id === '2.1');

      expect(task?.status).toBe('in_progress');
    });

    it('should preserve other tasks', () => {
      const updated = updateProjectTask(sampleContent, '1.1', {
        status: 'failed',
      });

      const doc = parseProjectMd(updated);
      const task12 = doc.implementation_phases[0]?.tasks.find((t) => t.id === '1.2');

      expect(task12?.status).toBe('complete'); // Should be unchanged
    });
  });

  describe('updateProjectApproval', () => {
    it('should update existing approval', () => {
      const updated = updateProjectApproval(
        sampleContent,
        'Phase 3',
        'approved',
        'Planning looks good'
      );

      const doc = parseProjectMd(updated);
      const approval = doc.approvals.find((a) => a.phase === 'Phase 3');

      expect(approval?.status).toBe('approved');
      expect(approval?.approved_at).toBeTruthy();
      expect(approval?.notes).toBe('Planning looks good');
    });

    it('should add new approval if not exists', () => {
      const updated = updateProjectApproval(
        sampleContent,
        'impl-1',
        'approved',
        'Implementation phase 1 complete'
      );

      const doc = parseProjectMd(updated);
      const approval = doc.approvals.find((a) => a.phase === 'impl-1');

      expect(approval).toBeTruthy();
      expect(approval?.status).toBe('approved');
    });
  });

  describe('addImplementationPhase', () => {
    it('should add new phase', () => {
      const newPhase: ImplementationPhase = {
        phase_number: 3,
        name: 'Testing',
        description: 'Add tests for all features',
        status: 'pending',
        tasks: [
          {
            id: '3.1',
            description: 'Add unit tests',
            status: 'pending',
            depends_on: [],
            acceptance_criteria: ['All tests pass'],
          },
        ],
      };

      const updated = addImplementationPhase(sampleContent, newPhase);
      const doc = parseProjectMd(updated);

      expect(doc.implementation_phases.length).toBe(3);
      expect(doc.implementation_phases[2]?.name).toBe('Testing');
      expect(doc.implementation_phases[2]?.tasks[0]?.id).toBe('3.1');
    });
  });

  describe('edge cases', () => {
    it('should handle empty implementation phases', () => {
      const doc: ProjectDocument = {
        meta: {
          version: 1,
          project_id: 'test',
          project_name: 'Test',
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

      const output = writeProjectMd(doc);

      expect(output).toContain('*No implementation phases defined yet.*');
    });

    it('should handle null ideation and spec', () => {
      const doc: ProjectDocument = {
        meta: {
          version: 1,
          project_id: 'test',
          project_name: 'Test',
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

      const output = writeProjectMd(doc);

      expect(output).toContain('*Status: Pending*');
      expect(output).toContain('*Status: Not Started*');
    });
  });
});
