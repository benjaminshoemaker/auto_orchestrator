import { describe, it, expect } from 'vitest';
import {
  IDEATION_SYSTEM_PROMPT,
  buildIdeationStartPrompt,
  buildIdeationFollowUpPrompt,
  buildIdeationSummaryPrompt,
  parseIdeationResponse,
  parseIdeationQuestions,
  isIdeationComplete,
  getMissingIdeationFields,
} from '../../../../../src/lib/llm/prompts/ideation.js';
import { IdeationContent } from '../../../../../src/types/index.js';

describe('Ideation Prompts', () => {
  describe('IDEATION_SYSTEM_PROMPT', () => {
    it('should define the role', () => {
      expect(IDEATION_SYSTEM_PROMPT).toContain('product strategist');
      expect(IDEATION_SYSTEM_PROMPT).toContain('software architect');
    });

    it('should include key instructions', () => {
      expect(IDEATION_SYSTEM_PROMPT).toContain('problem');
      expect(IDEATION_SYSTEM_PROMPT).toContain('users');
    });
  });

  describe('buildIdeationStartPrompt', () => {
    it('should include project name', () => {
      const prompt = buildIdeationStartPrompt('MyProject', 'An idea');
      expect(prompt).toContain('MyProject');
    });

    it('should include initial idea', () => {
      const prompt = buildIdeationStartPrompt('Project', 'Build a task manager');
      expect(prompt).toContain('Build a task manager');
    });

    it('should request XML-formatted response', () => {
      const prompt = buildIdeationStartPrompt('Project', 'Idea');
      expect(prompt).toContain('<understanding>');
      expect(prompt).toContain('<questions>');
      expect(prompt).toContain('<suggestions>');
    });
  });

  describe('buildIdeationFollowUpPrompt', () => {
    it('should include user input', () => {
      const prompt = buildIdeationFollowUpPrompt('Focus on mobile users');
      expect(prompt).toContain('Focus on mobile users');
    });

    it('should include current content if provided', () => {
      const content: Partial<IdeationContent> = {
        problem_statement: 'Task management is hard',
        target_users: 'Developers',
      };

      const prompt = buildIdeationFollowUpPrompt('More details', content);

      expect(prompt).toContain('Problem: Task management is hard');
      expect(prompt).toContain('Users: Developers');
    });

    it('should mention use cases count', () => {
      const content: Partial<IdeationContent> = {
        use_cases: ['UC1', 'UC2', 'UC3'],
      };

      const prompt = buildIdeationFollowUpPrompt('Continue', content);
      expect(prompt).toContain('3 defined');
    });
  });

  describe('buildIdeationSummaryPrompt', () => {
    it('should include conversation summary', () => {
      const prompt = buildIdeationSummaryPrompt('We discussed X and Y');
      expect(prompt).toContain('We discussed X and Y');
    });

    it('should include partial content if provided', () => {
      const partial: Partial<IdeationContent> = {
        problem_statement: 'The problem',
        target_users: 'The users',
      };

      const prompt = buildIdeationSummaryPrompt('Summary', partial);
      expect(prompt).toContain('The problem');
      expect(prompt).toContain('The users');
    });

    it('should specify expected output format', () => {
      const prompt = buildIdeationSummaryPrompt('Summary');
      expect(prompt).toContain('<problem_statement>');
      expect(prompt).toContain('<target_users>');
      expect(prompt).toContain('<use_cases>');
      expect(prompt).toContain('<success_criteria>');
      expect(prompt).toContain('<must_have>');
      expect(prompt).toContain('<nice_to_have>');
      expect(prompt).toContain('<out_of_scope>');
    });
  });

  describe('parseIdeationResponse', () => {
    it('should parse complete response', () => {
      const response = `
<problem_statement>
Users struggle to manage tasks efficiently
</problem_statement>

<target_users>
Software developers working on multiple projects
</target_users>

<use_cases>
- Create and organize tasks
- Track progress
- Set deadlines
</use_cases>

<success_criteria>
- 80% task completion rate
- Reduced time to plan
</success_criteria>

<must_have>
- Task creation
- Due dates
</must_have>

<nice_to_have>
- Collaboration features
</nice_to_have>

<out_of_scope>
- Video conferencing
</out_of_scope>
`;

      const result = parseIdeationResponse(response);

      expect(result.problem_statement).toBe('Users struggle to manage tasks efficiently');
      expect(result.target_users).toBe('Software developers working on multiple projects');
      expect(result.use_cases).toEqual([
        'Create and organize tasks',
        'Track progress',
        'Set deadlines',
      ]);
      expect(result.success_criteria).toEqual([
        '80% task completion rate',
        'Reduced time to plan',
      ]);
      expect(result.constraints?.must_have).toEqual(['Task creation', 'Due dates']);
      expect(result.constraints?.nice_to_have).toEqual(['Collaboration features']);
      expect(result.constraints?.out_of_scope).toEqual(['Video conferencing']);
    });

    it('should handle partial response', () => {
      const response = `
<problem_statement>The problem</problem_statement>
<target_users>The users</target_users>
`;

      const result = parseIdeationResponse(response);

      expect(result.problem_statement).toBe('The problem');
      expect(result.target_users).toBe('The users');
      expect(result.use_cases).toBeUndefined();
    });

    it('should handle missing tags', () => {
      const response = 'No tags here';
      const result = parseIdeationResponse(response);

      expect(result.problem_statement).toBeUndefined();
      expect(result.target_users).toBeUndefined();
    });
  });

  describe('parseIdeationQuestions', () => {
    it('should parse numbered questions', () => {
      const response = `
<questions>
1. What is the target platform?
2. How many users do you expect?
3. What is the timeline?
</questions>
`;

      const questions = parseIdeationQuestions(response);

      expect(questions).toHaveLength(3);
      expect(questions[0]).toBe('What is the target platform?');
    });

    it('should parse bullet questions', () => {
      const response = `
<questions>
- Who are the primary users?
- What is the budget?
</questions>
`;

      const questions = parseIdeationQuestions(response);

      expect(questions).toHaveLength(2);
      expect(questions[0]).toBe('Who are the primary users?');
    });

    it('should handle questions without standard formatting', () => {
      const response = `
<questions>
What features are must-haves?
What is the timeline?
</questions>
`;

      const questions = parseIdeationQuestions(response);

      expect(questions).toHaveLength(2);
    });

    it('should return empty array if no questions tag', () => {
      const response = 'No questions here';
      const questions = parseIdeationQuestions(response);

      expect(questions).toEqual([]);
    });
  });

  describe('isIdeationComplete', () => {
    it('should return true for complete content', () => {
      const content: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['Criterion'],
        constraints: {
          must_have: [],
          nice_to_have: [],
          out_of_scope: [],
        },
      };

      expect(isIdeationComplete(content)).toBe(true);
    });

    it('should return false if missing problem statement', () => {
      const content: Partial<IdeationContent> = {
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['Criterion'],
      };

      expect(isIdeationComplete(content)).toBe(false);
    });

    it('should return false if not enough use cases', () => {
      const content: Partial<IdeationContent> = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2'], // Only 2
        success_criteria: ['Criterion'],
      };

      expect(isIdeationComplete(content)).toBe(false);
    });

    it('should return false if no success criteria', () => {
      const content: Partial<IdeationContent> = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: [],
      };

      expect(isIdeationComplete(content)).toBe(false);
    });
  });

  describe('getMissingIdeationFields', () => {
    it('should return empty array for complete content', () => {
      const content: IdeationContent = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2', 'UC3'],
        success_criteria: ['Criterion'],
        constraints: {
          must_have: [],
          nice_to_have: [],
          out_of_scope: [],
        },
      };

      expect(getMissingIdeationFields(content)).toEqual([]);
    });

    it('should list missing fields', () => {
      const content: Partial<IdeationContent> = {
        problem_statement: 'Problem',
      };

      const missing = getMissingIdeationFields(content);

      expect(missing).toContain('target_users');
      expect(missing.some((m) => m.includes('use_cases'))).toBe(true);
      expect(missing.some((m) => m.includes('success_criteria'))).toBe(true);
    });

    it('should indicate insufficient use cases', () => {
      const content: Partial<IdeationContent> = {
        problem_statement: 'Problem',
        target_users: 'Users',
        use_cases: ['UC1', 'UC2'],
        success_criteria: ['Criterion'],
      };

      const missing = getMissingIdeationFields(content);

      expect(missing.some((m) => m.includes('at least 3'))).toBe(true);
    });
  });
});
