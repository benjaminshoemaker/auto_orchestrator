import { describe, it, expect } from 'vitest';
import {
  VALIDATION_SYSTEM_PROMPT,
  buildIdeationValidationPrompt,
  buildSpecificationValidationPrompt,
  buildPlanningValidationPrompt,
  parseValidationResponse,
} from '../../../../../src/lib/llm/prompts/validation.js';

describe('Validation Prompts', () => {
  describe('VALIDATION_SYSTEM_PROMPT', () => {
    it('should define QA role', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('quality assurance');
    });
  });

  describe('buildIdeationValidationPrompt', () => {
    it('should include all content', () => {
      const prompt = buildIdeationValidationPrompt(
        'Users struggle with tasks',
        'Software developers',
        ['Create tasks', 'Track progress'],
        ['80% completion rate']
      );

      expect(prompt).toContain('Users struggle with tasks');
      expect(prompt).toContain('Software developers');
      expect(prompt).toContain('Create tasks');
      expect(prompt).toContain('80% completion rate');
    });

    it('should request structured response', () => {
      const prompt = buildIdeationValidationPrompt('P', 'U', ['UC'], ['SC']);

      expect(prompt).toContain('<is_valid>');
      expect(prompt).toContain('<issues>');
      expect(prompt).toContain('<suggestions>');
      expect(prompt).toContain('<score>');
    });
  });

  describe('buildSpecificationValidationPrompt', () => {
    it('should include architecture details', () => {
      const prompt = buildSpecificationValidationPrompt(
        'Three-tier architecture',
        ['Frontend: React', 'Backend: Node.js'],
        'Task entity with id, title'
      );

      expect(prompt).toContain('Three-tier architecture');
      expect(prompt).toContain('Frontend: React');
      expect(prompt).toContain('Task entity');
    });
  });

  describe('buildPlanningValidationPrompt', () => {
    it('should include phases summary', () => {
      const prompt = buildPlanningValidationPrompt([
        { name: 'Setup', taskCount: 5 },
        { name: 'Core', taskCount: 10 },
      ]);

      expect(prompt).toContain('Setup: 5 tasks');
      expect(prompt).toContain('Core: 10 tasks');
    });
  });

  describe('parseValidationResponse', () => {
    it('should parse valid response', () => {
      const response = `
<is_valid>true</is_valid>
<issues>
- Minor issue 1
- Minor issue 2
</issues>
<suggestions>
- Suggestion 1
- Suggestion 2
</suggestions>
<score>85</score>
`;

      const result = parseValidationResponse(response);

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toBe('Minor issue 1');
      expect(result.suggestions).toHaveLength(2);
      expect(result.score).toBe(85);
    });

    it('should parse invalid response', () => {
      const response = `
<is_valid>false</is_valid>
<issues>
1. Major issue
2. Another issue
</issues>
<suggestions>
* Fix this
</suggestions>
<score>35</score>
`;

      const result = parseValidationResponse(response);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Major issue');
      expect(result.score).toBe(35);
    });

    it('should handle missing tags', () => {
      const response = '<is_valid>true</is_valid>';
      const result = parseValidationResponse(response);

      expect(result.isValid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.suggestions).toEqual([]);
      expect(result.score).toBe(80); // Default for valid
    });

    it('should default score for invalid', () => {
      const response = '<is_valid>false</is_valid>';
      const result = parseValidationResponse(response);

      expect(result.score).toBe(40);
    });

    it('should clamp score to 0-100', () => {
      let response = '<is_valid>true</is_valid><score>150</score>';
      expect(parseValidationResponse(response).score).toBe(100);

      response = '<is_valid>false</is_valid><score>-10</score>';
      expect(parseValidationResponse(response).score).toBe(0);
    });
  });
});
