/**
 * Prompts and parsers for Phase 1: Ideation
 */

import { IdeationContent } from '../../../types/index.js';
import {
  buildSystemPrompt,
  buildPrompt,
  extractTagContent,
  parseBulletList,
  PromptSection,
} from './base.js';

/**
 * System prompt for ideation phase
 */
export const IDEATION_SYSTEM_PROMPT = buildSystemPrompt(
  'an expert product strategist and software architect helping to refine a project idea',
  [
    'You are in Phase 1: Idea Refinement.',
    'Your goal is to understand the software idea thoroughly by asking about:',
    '1. The problem being solved and the target users who experience it',
    '2. Current alternatives and their shortcomings',
    '3. Core use cases (need at least 3 specific scenarios)',
    '4. Success criteria (measurable outcomes)',
    '5. Constraints (must have, nice to have, out of scope)',
    '',
    'Ask questions ONE AT A TIME. After each answer, either ask a follow-up or move to the next topic.',
    '',
    'When you have gathered sufficient information, output a structured summary with:',
    '- Problem Statement',
    '- Target Users',
    '- Use Cases (at least 3)',
    '- Success Criteria',
    '- Constraints (must have, nice to have, out of scope)',
    '',
    'End your final summary with:',
    '---',
    'PHASE_1_COMPLETE',
    '---',
  ]
);

/**
 * Initial ideation prompt to start the conversation
 */
export function buildIdeationStartPrompt(projectName: string, initialIdea: string): string {
  const sections: PromptSection[] = [
    {
      title: 'Project',
      content: projectName,
    },
    {
      title: 'Initial Idea',
      content: initialIdea,
    },
    {
      title: 'Your Task',
      content: `Help refine this project idea. Start by:
1. Acknowledging the core concept
2. Asking 2-3 clarifying questions about the problem or users
3. Suggesting potential directions to explore

Format your response using these XML tags:
<understanding>Your understanding of the project concept</understanding>
<questions>Your clarifying questions</questions>
<suggestions>Initial directions to consider</suggestions>`,
    },
  ];

  return buildPrompt(sections);
}

/**
 * Follow-up prompt during ideation
 */
export function buildIdeationFollowUpPrompt(
  userInput: string,
  currentContent?: Partial<IdeationContent>
): string {
  const sections: PromptSection[] = [];

  if (currentContent) {
    const contentSummary: string[] = [];
    if (currentContent.problem_statement) {
      contentSummary.push(`Problem: ${currentContent.problem_statement}`);
    }
    if (currentContent.target_users) {
      contentSummary.push(`Users: ${currentContent.target_users}`);
    }
    if (currentContent.use_cases && currentContent.use_cases.length > 0) {
      contentSummary.push(`Use cases: ${currentContent.use_cases.length} defined`);
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
    content: `Continue refining the idea based on this input.
If you have enough information, start structuring your response with:
<problem_statement>Clear problem definition</problem_statement>
<target_users>Who will use this</target_users>
<use_cases>Specific use cases (use bullet points)</use_cases>
<success_criteria>How to measure success (use bullet points)</success_criteria>

If more information is needed, ask focused questions.`,
  });

  return buildPrompt(sections);
}

/**
 * Final ideation summary prompt
 */
export function buildIdeationSummaryPrompt(
  conversationSummary: string,
  partialContent?: Partial<IdeationContent>
): string {
  const sections: PromptSection[] = [
    {
      title: 'Conversation Summary',
      content: conversationSummary,
    },
  ];

  if (partialContent) {
    const partial: string[] = [];
    if (partialContent.problem_statement) {
      partial.push(`Problem: ${partialContent.problem_statement}`);
    }
    if (partialContent.target_users) {
      partial.push(`Users: ${partialContent.target_users}`);
    }

    if (partial.length > 0) {
      sections.push({
        title: 'Already Defined',
        content: partial.join('\n'),
      });
    }
  }

  sections.push({
    title: 'Task',
    content: `Based on our discussion, provide a complete ideation summary.
Use this exact format:

<problem_statement>
The core problem this project solves
</problem_statement>

<target_users>
Who will use this and their characteristics
</target_users>

<use_cases>
- Use case 1
- Use case 2
- Use case 3
(at least 3 use cases)
</use_cases>

<success_criteria>
- Criterion 1
- Criterion 2
(measurable success criteria)
</success_criteria>

<must_have>
- Constraint 1
- Constraint 2
</must_have>

<nice_to_have>
- Feature 1
- Feature 2
</nice_to_have>

<out_of_scope>
- Exclusion 1
- Exclusion 2
</out_of_scope>`,
  });

  return buildPrompt(sections);
}

/**
 * Parse ideation content from LLM response
 */
export function parseIdeationResponse(response: string): Partial<IdeationContent> {
  const result: Partial<IdeationContent> = {};

  // Extract problem statement
  const problemStatement = extractTagContent(response, 'problem_statement');
  if (problemStatement) {
    result.problem_statement = problemStatement;
  }

  // Extract target users
  const targetUsers = extractTagContent(response, 'target_users');
  if (targetUsers) {
    result.target_users = targetUsers;
  }

  // Extract use cases
  const useCasesContent = extractTagContent(response, 'use_cases');
  if (useCasesContent) {
    result.use_cases = parseBulletList(useCasesContent);
  }

  // Extract success criteria
  const successContent = extractTagContent(response, 'success_criteria');
  if (successContent) {
    result.success_criteria = parseBulletList(successContent);
  }

  // Extract constraints
  const mustHave = extractTagContent(response, 'must_have');
  const niceToHave = extractTagContent(response, 'nice_to_have');
  const outOfScope = extractTagContent(response, 'out_of_scope');

  if (mustHave || niceToHave || outOfScope) {
    result.constraints = {
      must_have: mustHave ? parseBulletList(mustHave) : [],
      nice_to_have: niceToHave ? parseBulletList(niceToHave) : [],
      out_of_scope: outOfScope ? parseBulletList(outOfScope) : [],
    };
  }

  return result;
}

/**
 * Extract questions from response
 */
export function parseIdeationQuestions(response: string): string[] {
  const questionsContent = extractTagContent(response, 'questions');
  if (!questionsContent) {
    return [];
  }

  // Try numbered list first
  const lines = questionsContent.split('\n');
  const questions: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered questions or bullet questions
    const match = trimmed.match(/^(?:\d+\.|[-*])\s*(.+\??)$/);
    if (match?.[1]) {
      questions.push(match[1].trim());
    } else if (trimmed.endsWith('?')) {
      questions.push(trimmed);
    }
  }

  return questions;
}

/**
 * Check if ideation content is complete
 */
export function isIdeationComplete(content: Partial<IdeationContent>): boolean {
  return !!(
    content.problem_statement &&
    content.target_users &&
    content.use_cases &&
    content.use_cases.length >= 3 &&
    content.success_criteria &&
    content.success_criteria.length > 0
  );
}

/**
 * Get missing fields for ideation
 */
export function getMissingIdeationFields(content: Partial<IdeationContent>): string[] {
  const missing: string[] = [];

  if (!content.problem_statement) {
    missing.push('problem_statement');
  }
  if (!content.target_users) {
    missing.push('target_users');
  }
  if (!content.use_cases || content.use_cases.length < 3) {
    missing.push('use_cases (need at least 3)');
  }
  if (!content.success_criteria || content.success_criteria.length === 0) {
    missing.push('success_criteria');
  }

  return missing;
}
