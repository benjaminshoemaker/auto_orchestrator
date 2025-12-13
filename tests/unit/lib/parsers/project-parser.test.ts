import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  parseProjectMd,
  parseSections,
  parseTaskTable,
} from '../../../../src/lib/parsers/project-parser.js';

describe('Project Parser', () => {
  let sampleContent: string;

  beforeAll(async () => {
    const fixturePath = path.resolve(__dirname, '../../../fixtures/sample-project.md');
    sampleContent = await fs.readFile(fixturePath, 'utf-8');
  });

  describe('parseProjectMd', () => {
    it('should parse complete project document', () => {
      const doc = parseProjectMd(sampleContent);

      expect(doc.meta.project_name).toBe('Test Todo App');
      expect(doc.meta.version).toBe(1);
      expect(doc.meta.current_phase).toBe(3);
    });

    it('should parse meta fields correctly', () => {
      const doc = parseProjectMd(sampleContent);

      expect(doc.meta.project_id).toBe('test-project-abc123');
      expect(doc.meta.phase_status).toBe('complete');
      expect(doc.meta.gates.ideation_complete).toBe(true);
      expect(doc.meta.gates.planning_approved).toBe(false);
      expect(doc.meta.cost.total_tokens).toBe(15000);
      expect(doc.meta.agent.primary).toBe('claude-code');
    });

    it('should parse ideation content', () => {
      const doc = parseProjectMd(sampleContent);

      expect(doc.ideation).not.toBeNull();
      expect(doc.ideation?.problem_statement).toContain('simple way to manage');
      expect(doc.ideation?.use_cases.length).toBeGreaterThan(0);
      expect(doc.ideation?.success_criteria.length).toBeGreaterThan(0);
    });

    it('should parse specification content', () => {
      const doc = parseProjectMd(sampleContent);

      expect(doc.specification).not.toBeNull();
      expect(doc.specification?.architecture).toContain('Single-page application');
      expect(doc.specification?.tech_stack.length).toBeGreaterThan(0);
    });

    it('should parse tech stack table', () => {
      const doc = parseProjectMd(sampleContent);

      expect(doc.specification?.tech_stack).toContainEqual({
        layer: 'Frontend',
        choice: 'React',
        rationale: 'Component-based, large ecosystem',
      });
    });

    it('should parse implementation phases', () => {
      const doc = parseProjectMd(sampleContent);

      expect(doc.implementation_phases.length).toBe(2);
      expect(doc.implementation_phases[0]?.name).toBe('Foundation');
      expect(doc.implementation_phases[1]?.name).toBe('Core Features');
    });

    it('should parse tasks in phases', () => {
      const doc = parseProjectMd(sampleContent);

      const phase1 = doc.implementation_phases[0];
      expect(phase1?.tasks.length).toBe(3);

      const task1 = phase1?.tasks[0];
      expect(task1?.id).toBe('1.1');
      expect(task1?.status).toBe('complete');
      expect(task1?.depends_on).toEqual([]);
    });

    it('should parse task dependencies', () => {
      const doc = parseProjectMd(sampleContent);

      const phase2 = doc.implementation_phases[1];
      const task = phase2?.tasks.find((t) => t.id === '2.2');

      expect(task?.depends_on).toContain('2.1');
    });

    it('should parse approvals', () => {
      const doc = parseProjectMd(sampleContent);

      expect(doc.approvals.length).toBe(3);
      expect(doc.approvals[0]?.phase).toBe('Phase 1');
      expect(doc.approvals[0]?.status).toBe('approved');
      expect(doc.approvals[2]?.status).toBe('pending');
    });

    it('should determine phase status from tasks', () => {
      const doc = parseProjectMd(sampleContent);

      // Phase 1 has complete and in_progress tasks
      expect(doc.implementation_phases[0]?.status).toBe('in_progress');

      // Phase 2 has all pending tasks
      expect(doc.implementation_phases[1]?.status).toBe('pending');
    });
  });

  describe('parseSections', () => {
    it('should split markdown by ## headers', () => {
      const markdown = `## Section 1

Content 1

## Section 2

Content 2`;

      const sections = parseSections(markdown);

      expect(sections['Section 1']).toBe('Content 1');
      expect(sections['Section 2']).toBe('Content 2');
    });

    it('should handle empty sections', () => {
      const markdown = `## Empty

## Next

Content here`;

      const sections = parseSections(markdown);

      expect(sections['Empty']).toBe('');
      expect(sections['Next']).toBe('Content here');
    });
  });

  describe('parseTaskTable', () => {
    it('should parse task table format', () => {
      const content = `
| ID | Description | Status | Depends On |
|----|-------------|--------|------------|
| 1.1 | First task | pending | - |
| 1.2 | Second task | complete | 1.1 |
`;

      const tasks = parseTaskTable(content);

      expect(tasks.length).toBe(2);
      expect(tasks[0]?.id).toBe('1.1');
      expect(tasks[0]?.status).toBe('pending');
      expect(tasks[1]?.id).toBe('1.2');
      expect(tasks[1]?.status).toBe('complete');
      expect(tasks[1]?.depends_on).toContain('1.1');
    });

    it('should handle various status formats', () => {
      const content = `
| ID | Description | Status | Depends On |
|----|-------------|--------|------------|
| 1 | Task A | ✓ complete | - |
| 2 | Task B | 🔄 in progress | - |
| 3 | Task C | ✗ failed | - |
| 4 | Task D | skipped | - |
`;

      const tasks = parseTaskTable(content);

      expect(tasks[0]?.status).toBe('complete');
      expect(tasks[1]?.status).toBe('in_progress');
      expect(tasks[2]?.status).toBe('failed');
      expect(tasks[3]?.status).toBe('skipped');
    });

    it('should parse multiple dependencies', () => {
      const content = `
| ID | Description | Status | Depends On |
|----|-------------|--------|------------|
| 1.3 | Third task | pending | 1.1, 1.2 |
`;

      const tasks = parseTaskTable(content);

      expect(tasks[0]?.depends_on).toEqual(['1.1', '1.2']);
    });
  });

  describe('edge cases', () => {
    it('should handle minimal project', () => {
      const minimal = `---
version: 1
project_id: "minimal"
project_name: "Minimal Project"
created: "2024-01-01T00:00:00Z"
updated: "2024-01-01T00:00:00Z"
current_phase: 1
current_phase_name: "Ideation"
phase_status: "pending"
gates:
  ideation_complete: false
  ideation_approved: false
  spec_complete: false
  spec_approved: false
  planning_complete: false
  planning_approved: false
cost:
  total_tokens: 0
  total_cost_usd: 0
agent:
  primary: "claude-code"
  timeout_minutes: 10
---

# Minimal Project

## Phase 1: Idea Refinement

*Status: Pending*

## Approvals

| Phase | Status | Approved At | Notes |
|-------|--------|-------------|-------|
`;

      const doc = parseProjectMd(minimal);

      expect(doc.meta.project_name).toBe('Minimal Project');
      expect(doc.ideation).toBeNull();
      expect(doc.specification).toBeNull();
      expect(doc.implementation_phases).toHaveLength(0);
    });
  });
});
