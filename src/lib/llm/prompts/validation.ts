/**
 * Validation prompts for checking and improving outputs
 */

import { buildSystemPrompt, buildPrompt, extractTagContent, PromptSection } from './base.js';

/**
 * System prompt for validation
 */
export const VALIDATION_SYSTEM_PROMPT = buildSystemPrompt(
  'a quality assurance expert validating project planning outputs',
  [
    'Review the provided content for completeness, consistency, and quality.',
    'Identify any missing information, ambiguities, or potential issues.',
    'Suggest specific improvements where needed.',
    'Be constructive but thorough in your review.',
  ]
);

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  score: number; // 0-100
}

/**
 * Build validation prompt for ideation
 */
export function buildIdeationValidationPrompt(
  problemStatement: string,
  targetUsers: string,
  useCases: string[],
  successCriteria: string[]
): string {
  const sections: PromptSection[] = [
    {
      title: 'Problem Statement',
      content: problemStatement,
    },
    {
      title: 'Target Users',
      content: targetUsers,
    },
    {
      title: 'Use Cases',
      content: useCases.map((uc, i) => `${i + 1}. ${uc}`).join('\n'),
    },
    {
      title: 'Success Criteria',
      content: successCriteria.map((sc) => `- ${sc}`).join('\n'),
    },
    {
      title: 'Validation Task',
      content: `Review this ideation content and assess:
1. Is the problem statement clear and specific?
2. Are the target users well-defined?
3. Do the use cases cover the main scenarios?
4. Are success criteria measurable?

Respond using:
<is_valid>true or false</is_valid>
<issues>List any problems found</issues>
<suggestions>List improvement suggestions</suggestions>
<score>0-100 quality score</score>`,
    },
  ];

  return buildPrompt(sections);
}

/**
 * Build validation prompt for specification
 */
export function buildSpecificationValidationPrompt(
  architecture: string,
  techStack: string[],
  dataModels: string
): string {
  const sections: PromptSection[] = [
    {
      title: 'Architecture',
      content: architecture,
    },
    {
      title: 'Tech Stack',
      content: techStack.join('\n'),
    },
    {
      title: 'Data Models',
      content: dataModels,
    },
    {
      title: 'Validation Task',
      content: `Review this technical specification and assess:
1. Is the architecture appropriate for the requirements?
2. Is the tech stack well-justified?
3. Are data models complete and properly related?
4. Are there any technical gaps or concerns?

Respond using:
<is_valid>true or false</is_valid>
<issues>List any problems found</issues>
<suggestions>List improvement suggestions</suggestions>
<score>0-100 quality score</score>`,
    },
  ];

  return buildPrompt(sections);
}

/**
 * Build validation prompt for planning
 */
export function buildPlanningValidationPrompt(
  phases: Array<{ name: string; taskCount: number }>
): string {
  const sections: PromptSection[] = [
    {
      title: 'Implementation Phases',
      content: phases.map((p) => `- ${p.name}: ${p.taskCount} tasks`).join('\n'),
    },
    {
      title: 'Validation Task',
      content: `Review this implementation plan and assess:
1. Are phases logically ordered?
2. Are tasks appropriately sized?
3. Are dependencies reasonable?
4. Is the plan achievable?

Respond using:
<is_valid>true or false</is_valid>
<issues>List any problems found</issues>
<suggestions>List improvement suggestions</suggestions>
<score>0-100 quality score</score>`,
    },
  ];

  return buildPrompt(sections);
}

/**
 * Parse validation response
 */
export function parseValidationResponse(response: string): ValidationResult {
  const isValidContent = extractTagContent(response, 'is_valid');
  const issuesContent = extractTagContent(response, 'issues');
  const suggestionsContent = extractTagContent(response, 'suggestions');
  const scoreContent = extractTagContent(response, 'score');

  const isValid = isValidContent?.toLowerCase() === 'true';

  const issues = issuesContent
    ? issuesContent
        .split('\n')
        .map((line) => line.replace(/^[-*\d.]+\s*/, '').trim())
        .filter(Boolean)
    : [];

  const suggestions = suggestionsContent
    ? suggestionsContent
        .split('\n')
        .map((line) => line.replace(/^[-*\d.]+\s*/, '').trim())
        .filter(Boolean)
    : [];

  const score = scoreContent ? parseInt(scoreContent, 10) : isValid ? 80 : 40;

  return {
    isValid,
    issues,
    suggestions,
    score: Math.max(0, Math.min(100, score)),
  };
}
