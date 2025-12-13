import { describe, it, expect } from 'vitest';
import {
  SPECIFICATION_SYSTEM_PROMPT,
  buildSpecificationStartPrompt,
  buildSpecificationFollowUpPrompt,
  buildSpecificationSummaryPrompt,
  parseSpecificationResponse,
  isSpecificationComplete,
  getMissingSpecificationFields,
} from '../../../../../src/lib/llm/prompts/specification.js';
import { IdeationContent, SpecificationContent } from '../../../../../src/types/index.js';

const sampleIdeation: IdeationContent = {
  problem_statement: 'Managing tasks is difficult',
  target_users: 'Software developers',
  use_cases: ['Create tasks', 'Track progress', 'Set deadlines'],
  success_criteria: ['80% task completion'],
  constraints: {
    must_have: ['Task creation', 'Due dates'],
    nice_to_have: ['Collaboration'],
    out_of_scope: ['Video calls'],
  },
};

describe('Specification Prompts', () => {
  describe('SPECIFICATION_SYSTEM_PROMPT', () => {
    it('should define the architect role', () => {
      expect(SPECIFICATION_SYSTEM_PROMPT).toContain('software architect');
    });

    it('should mention technical specification', () => {
      expect(SPECIFICATION_SYSTEM_PROMPT).toContain('technical specification');
    });
  });

  describe('buildSpecificationStartPrompt', () => {
    it('should include project name', () => {
      const prompt = buildSpecificationStartPrompt('TaskManager', sampleIdeation);
      expect(prompt).toContain('TaskManager');
    });

    it('should include ideation content', () => {
      const prompt = buildSpecificationStartPrompt('Project', sampleIdeation);

      expect(prompt).toContain('Managing tasks is difficult');
      expect(prompt).toContain('Software developers');
      expect(prompt).toContain('Create tasks');
    });

    it('should include constraints', () => {
      const prompt = buildSpecificationStartPrompt('Project', sampleIdeation);

      expect(prompt).toContain('Task creation');
      expect(prompt).toContain('Collaboration');
      expect(prompt).toContain('Video calls');
    });

    it('should request architecture overview', () => {
      const prompt = buildSpecificationStartPrompt('Project', sampleIdeation);

      expect(prompt).toContain('<architecture_overview>');
      expect(prompt).toContain('<questions>');
    });
  });

  describe('buildSpecificationFollowUpPrompt', () => {
    it('should include user input', () => {
      const prompt = buildSpecificationFollowUpPrompt('Use PostgreSQL');
      expect(prompt).toContain('Use PostgreSQL');
    });

    it('should show current progress', () => {
      const current: Partial<SpecificationContent> = {
        architecture: 'Microservices',
        tech_stack: ['Node.js', 'React'],
      };

      const prompt = buildSpecificationFollowUpPrompt('Continue', current);

      expect(prompt).toContain('Architecture: defined');
      expect(prompt).toContain('Tech stack: 2 items');
    });

    it('should request structured response', () => {
      const prompt = buildSpecificationFollowUpPrompt('Details');

      expect(prompt).toContain('<architecture>');
      expect(prompt).toContain('<tech_stack>');
      expect(prompt).toContain('<data_models>');
    });
  });

  describe('buildSpecificationSummaryPrompt', () => {
    it('should include ideation summary', () => {
      const prompt = buildSpecificationSummaryPrompt('Discussion', sampleIdeation);

      expect(prompt).toContain('Managing tasks is difficult');
    });

    it('should include discussion summary', () => {
      const prompt = buildSpecificationSummaryPrompt('We decided on REST API', sampleIdeation);

      expect(prompt).toContain('We decided on REST API');
    });

    it('should include partial architecture if provided', () => {
      const partial: Partial<SpecificationContent> = {
        architecture: 'Monolithic with MVC',
      };

      const prompt = buildSpecificationSummaryPrompt('Summary', sampleIdeation, partial);

      expect(prompt).toContain('Monolithic with MVC');
    });

    it('should specify complete output format', () => {
      const prompt = buildSpecificationSummaryPrompt('Summary', sampleIdeation);

      expect(prompt).toContain('<architecture>');
      expect(prompt).toContain('<tech_stack>');
      expect(prompt).toContain('<data_models>');
      expect(prompt).toContain('<api_contracts>');
    });
  });

  describe('parseSpecificationResponse', () => {
    it('should parse complete response', () => {
      const response = `
<architecture>
A three-tier architecture with:
- Frontend: React SPA
- Backend: Node.js REST API
- Database: PostgreSQL
</architecture>

<tech_stack>
- Frontend: React with TypeScript
- Backend: Express.js
- Database: PostgreSQL
- ORM: Prisma
</tech_stack>

<data_models>
Entity: Task
- id: UUID
- title: string
- status: enum
</data_models>

<api_contracts>
POST /api/tasks
- Request: { title: string }
- Response: { id: string, title: string }
</api_contracts>
`;

      const result = parseSpecificationResponse(response);

      expect(result.architecture).toContain('three-tier architecture');
      expect(result.tech_stack).toHaveLength(4);
      expect(result.tech_stack?.[0]).toEqual({
        layer: 'Frontend',
        choice: 'React with TypeScript',
        rationale: '',
      });
      expect(result.tech_stack?.[3]).toEqual({
        layer: 'ORM',
        choice: 'Prisma',
        rationale: '',
      });
      expect(result.data_models).toContain('Entity: Task');
      expect(result.api_contracts).toContain('POST /api/tasks');
    });

    it('should handle partial response', () => {
      const response = `
<architecture>Simple monolith</architecture>
<tech_stack>
- Python
- Flask
</tech_stack>
`;

      const result = parseSpecificationResponse(response);

      expect(result.architecture).toBe('Simple monolith');
      expect(result.tech_stack).toEqual([
        { layer: 'General', choice: 'Python', rationale: '' },
        { layer: 'General', choice: 'Flask', rationale: '' },
      ]);
      expect(result.data_models).toBeUndefined();
    });

    it('should handle missing tags', () => {
      const response = 'Just some text';
      const result = parseSpecificationResponse(response);

      expect(result.architecture).toBeUndefined();
      expect(result.tech_stack).toBeUndefined();
    });
  });

  describe('isSpecificationComplete', () => {
    it('should return true for complete spec', () => {
      const content: Partial<SpecificationContent> = {
        architecture: 'Microservices',
        tech_stack: ['Node.js', 'React'],
        data_models: 'User, Task entities',
      };

      expect(isSpecificationComplete(content)).toBe(true);
    });

    it('should return false without architecture', () => {
      const content: Partial<SpecificationContent> = {
        tech_stack: ['Node.js'],
        data_models: 'Models',
      };

      expect(isSpecificationComplete(content)).toBe(false);
    });

    it('should return false without tech stack', () => {
      const content: Partial<SpecificationContent> = {
        architecture: 'Arch',
        tech_stack: [],
        data_models: 'Models',
      };

      expect(isSpecificationComplete(content)).toBe(false);
    });

    it('should return false without data models', () => {
      const content: Partial<SpecificationContent> = {
        architecture: 'Arch',
        tech_stack: ['Node.js'],
      };

      expect(isSpecificationComplete(content)).toBe(false);
    });
  });

  describe('getMissingSpecificationFields', () => {
    it('should return empty for complete spec', () => {
      const content: Partial<SpecificationContent> = {
        architecture: 'Arch',
        tech_stack: ['Tech'],
        data_models: 'Models',
      };

      expect(getMissingSpecificationFields(content)).toEqual([]);
    });

    it('should list all missing fields', () => {
      const content: Partial<SpecificationContent> = {};
      const missing = getMissingSpecificationFields(content);

      expect(missing).toContain('architecture');
      expect(missing).toContain('tech_stack');
      expect(missing).toContain('data_models');
    });

    it('should include tech_stack if empty', () => {
      const content: Partial<SpecificationContent> = {
        architecture: 'Arch',
        tech_stack: [],
        data_models: 'Models',
      };

      expect(getMissingSpecificationFields(content)).toContain('tech_stack');
    });
  });
});
