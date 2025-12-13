import { describe, it, expect } from 'vitest';
import { slugify, INITIAL_PROJECT_MD, CLAUDE_MD_TEMPLATE } from '../../../src/utils/templates.js';

describe('Templates', () => {
  describe('slugify', () => {
    it('should convert spaces to hyphens', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('should convert to lowercase', () => {
      expect(slugify('HelloWorld')).toBe('helloworld');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello-world');
    });

    it('should handle multiple spaces/special chars', () => {
      expect(slugify('Hello   World!!!')).toBe('hello-world');
    });

    it('should trim leading/trailing hyphens', () => {
      expect(slugify('--Hello--')).toBe('hello');
    });

    it('should truncate to 50 characters', () => {
      const longText = 'a'.repeat(100);
      expect(slugify(longText).length).toBe(50);
    });

    it('should handle empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('should handle numbers', () => {
      expect(slugify('Project 123')).toBe('project-123');
    });
  });

  describe('INITIAL_PROJECT_MD', () => {
    it('should contain all placeholders', () => {
      expect(INITIAL_PROJECT_MD).toContain('{{PROJECT_ID}}');
      expect(INITIAL_PROJECT_MD).toContain('{{PROJECT_NAME}}');
      expect(INITIAL_PROJECT_MD).toContain('{{TIMESTAMP}}');
    });

    it('should have YAML frontmatter', () => {
      expect(INITIAL_PROJECT_MD).toMatch(/^---\n/);
      expect(INITIAL_PROJECT_MD).toContain('\n---\n');
    });

    it('should have all required meta fields', () => {
      expect(INITIAL_PROJECT_MD).toContain('version: 1');
      expect(INITIAL_PROJECT_MD).toContain('current_phase: 1');
      expect(INITIAL_PROJECT_MD).toContain('phase_status: "pending"');
      expect(INITIAL_PROJECT_MD).toContain('ideation_complete: false');
      expect(INITIAL_PROJECT_MD).toContain('spec_complete: false');
      expect(INITIAL_PROJECT_MD).toContain('planning_complete: false');
    });

    it('should have all phase sections', () => {
      expect(INITIAL_PROJECT_MD).toContain('## Phase 1: Idea Refinement');
      expect(INITIAL_PROJECT_MD).toContain('## Phase 2: Specification');
      expect(INITIAL_PROJECT_MD).toContain('## Phase 3: Implementation Planning');
    });

    it('should have approvals table', () => {
      expect(INITIAL_PROJECT_MD).toContain('## Approvals');
      expect(INITIAL_PROJECT_MD).toContain('| Phase | Status |');
    });
  });

  describe('CLAUDE_MD_TEMPLATE', () => {
    it('should contain project name placeholder', () => {
      expect(CLAUDE_MD_TEMPLATE).toContain('{{PROJECT_NAME}}');
    });

    it('should have guidelines section', () => {
      expect(CLAUDE_MD_TEMPLATE).toContain('## Guidelines');
    });

    it('should have task result format', () => {
      expect(CLAUDE_MD_TEMPLATE).toContain('## Task Result Format');
      expect(CLAUDE_MD_TEMPLATE).toContain('"task_id"');
      expect(CLAUDE_MD_TEMPLATE).toContain('"status"');
    });
  });
});
