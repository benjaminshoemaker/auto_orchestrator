/**
 * Prompts and parsers for Phase 2: Specification
 */

import { IdeationContent, SpecificationContent, TechStackItem } from '../../../types/index.js';
import {
  buildSystemPrompt,
  buildPrompt,
  extractTagContent,
  parseBulletList,
  PromptSection,
} from './base.js';

/**
 * Parse tech stack items from bullet list format
 * Expected format: "Layer: Choice" or "Layer: Choice - rationale"
 */
function parseTechStack(content: string): TechStackItem[] {
  const items = parseBulletList(content);
  return items.map((item) => {
    // Try to parse "Layer: Choice - rationale" or "Layer: Choice"
    const colonIndex = item.indexOf(':');
    if (colonIndex === -1) {
      return {
        layer: 'General',
        choice: item,
        rationale: '',
      };
    }

    const layer = item.slice(0, colonIndex).trim();
    const rest = item.slice(colonIndex + 1).trim();

    // Check for rationale after dash or parentheses
    const dashMatch = rest.match(/^([^(-]+)(?:\s*[-–]\s*(.+)|\s*\((.+)\))?$/);
    if (dashMatch) {
      return {
        layer,
        choice: dashMatch[1]?.trim() || rest,
        rationale: (dashMatch[2] || dashMatch[3] || '').trim(),
      };
    }

    return {
      layer,
      choice: rest,
      rationale: '',
    };
  });
}

/**
 * System prompt for specification phase
 */
export const SPECIFICATION_SYSTEM_PROMPT = buildSystemPrompt(
  'an expert software architect helping to create a technical specification',
  [
    'Your goal is to transform the ideation into a concrete technical specification.',
    'Focus on architecture, technology choices, and data models.',
    'Consider scalability, maintainability, and best practices.',
    'Make practical recommendations based on the project requirements.',
    'Be specific about technology choices and justify your recommendations.',
  ]
);

/**
 * Build initial specification prompt
 */
export function buildSpecificationStartPrompt(
  projectName: string,
  ideation: IdeationContent
): string {
  const sections: PromptSection[] = [
    {
      title: 'Project',
      content: projectName,
    },
    {
      title: 'Problem Statement',
      content: ideation.problem_statement,
    },
    {
      title: 'Target Users',
      content: ideation.target_users,
    },
    {
      title: 'Use Cases',
      content: ideation.use_cases.map((uc, i) => `${i + 1}. ${uc}`).join('\n'),
    },
    {
      title: 'Success Criteria',
      content: ideation.success_criteria.map((sc) => `- ${sc}`).join('\n'),
    },
    {
      title: 'Constraints',
      content: [
        ideation.constraints.must_have.length > 0
          ? `Must have:\n${ideation.constraints.must_have.map((c) => `- ${c}`).join('\n')}`
          : '',
        ideation.constraints.nice_to_have.length > 0
          ? `Nice to have:\n${ideation.constraints.nice_to_have.map((c) => `- ${c}`).join('\n')}`
          : '',
        ideation.constraints.out_of_scope.length > 0
          ? `Out of scope:\n${ideation.constraints.out_of_scope.map((c) => `- ${c}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    {
      title: 'Your Task',
      content: `Based on this ideation, start defining the technical specification.

Begin with a high-level architecture overview and ask any clarifying questions about:
1. Deployment environment preferences
2. Scale expectations
3. Integration requirements
4. Technology constraints or preferences

Format your response using:
<architecture_overview>High-level architecture description</architecture_overview>
<questions>Any clarifying questions</questions>
<initial_recommendations>Initial technology recommendations</initial_recommendations>`,
    },
  ];

  return buildPrompt(sections);
}

/**
 * Follow-up prompt during specification
 */
export function buildSpecificationFollowUpPrompt(
  userInput: string,
  currentContent?: Partial<SpecificationContent>
): string {
  const sections: PromptSection[] = [];

  if (currentContent) {
    const contentSummary: string[] = [];
    if (currentContent.architecture) {
      contentSummary.push('Architecture: defined');
    }
    if (currentContent.tech_stack && currentContent.tech_stack.length > 0) {
      contentSummary.push(`Tech stack: ${currentContent.tech_stack.length} items`);
    }
    if (currentContent.data_models) {
      contentSummary.push('Data models: defined');
    }

    if (contentSummary.length > 0) {
      sections.push({
        title: 'Current Progress',
        content: contentSummary.join('\n'),
      });
    }
  }

  sections.push({
    title: 'User Input',
    content: userInput,
  });

  sections.push({
    title: 'Instructions',
    content: `Continue developing the specification based on this input.

If you have enough information to proceed, structure your response with:
<architecture>Detailed architecture description</architecture>
<tech_stack>Technology choices (use bullet points)</tech_stack>
<data_models>Data model definitions</data_models>
<api_contracts>API endpoint definitions (if applicable)</api_contracts>

If more information is needed, ask focused questions.`,
  });

  return buildPrompt(sections);
}

/**
 * Final specification summary prompt
 */
export function buildSpecificationSummaryPrompt(
  conversationSummary: string,
  ideation: IdeationContent,
  partialContent?: Partial<SpecificationContent>
): string {
  const sections: PromptSection[] = [
    {
      title: 'Ideation Summary',
      content: `Problem: ${ideation.problem_statement}\n\nUse cases:\n${ideation.use_cases.map((uc) => `- ${uc}`).join('\n')}`,
    },
    {
      title: 'Discussion Summary',
      content: conversationSummary,
    },
  ];

  if (partialContent?.architecture) {
    sections.push({
      title: 'Architecture So Far',
      content: partialContent.architecture,
    });
  }

  sections.push({
    title: 'Task',
    content: `Provide a complete technical specification.
Use this exact format:

<architecture>
Detailed description of the system architecture including:
- High-level components
- How they interact
- Key design decisions
</architecture>

<tech_stack>
- Category: Technology (e.g., "Frontend: React with TypeScript")
- Category: Technology
(list all technology choices)
</tech_stack>

<data_models>
Define the key data entities and their relationships.
Use a clear format like:

Entity: EntityName
- field1: type (description)
- field2: type (description)
</data_models>

<api_contracts>
Define key API endpoints (if applicable):

POST /api/resource
- Description: What it does
- Request: { field: type }
- Response: { field: type }
</api_contracts>`,
  });

  return buildPrompt(sections);
}

/**
 * Parse specification content from LLM response
 */
export function parseSpecificationResponse(
  response: string
): Partial<SpecificationContent> {
  const result: Partial<SpecificationContent> = {};

  // Extract architecture
  const architecture = extractTagContent(response, 'architecture');
  if (architecture) {
    result.architecture = architecture;
  }

  // Extract tech stack
  const techStackContent = extractTagContent(response, 'tech_stack');
  if (techStackContent) {
    result.tech_stack = parseTechStack(techStackContent);
  }

  // Extract data models
  const dataModels = extractTagContent(response, 'data_models');
  if (dataModels) {
    result.data_models = dataModels;
  }

  // Extract API contracts
  const apiContracts = extractTagContent(response, 'api_contracts');
  if (apiContracts) {
    result.api_contracts = apiContracts;
  }

  return result;
}

/**
 * Check if specification content is complete
 */
export function isSpecificationComplete(
  content: Partial<SpecificationContent>
): boolean {
  return !!(
    content.architecture &&
    content.tech_stack &&
    content.tech_stack.length > 0 &&
    content.data_models
  );
}

/**
 * Get missing fields for specification
 */
export function getMissingSpecificationFields(
  content: Partial<SpecificationContent>
): string[] {
  const missing: string[] = [];

  if (!content.architecture) {
    missing.push('architecture');
  }
  if (!content.tech_stack || content.tech_stack.length === 0) {
    missing.push('tech_stack');
  }
  if (!content.data_models) {
    missing.push('data_models');
  }

  return missing;
}
