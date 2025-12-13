/**
 * Base prompt utilities and common prompt building functions
 */

/**
 * Section of a prompt
 */
export interface PromptSection {
  title: string;
  content: string;
}

/**
 * Build a formatted prompt from sections
 */
export function buildPrompt(sections: PromptSection[]): string {
  return sections
    .filter((s) => s.content.trim())
    .map((s) => `## ${s.title}\n\n${s.content}`)
    .join('\n\n');
}

/**
 * Build a system prompt with role definition
 */
export function buildSystemPrompt(role: string, instructions: string[]): string {
  const lines = [`You are ${role}.`, '', ...instructions];
  return lines.join('\n');
}

/**
 * Format a list as numbered items
 */
export function formatNumberedList(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

/**
 * Format a list as bullet points
 */
export function formatBulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

/**
 * Extract content between XML-style tags
 */
export function extractTagContent(text: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() ?? null;
}

/**
 * Extract all occurrences of content between tags
 */
export function extractAllTagContent(text: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  const matches: string[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      matches.push(match[1].trim());
    }
  }

  return matches;
}

/**
 * Parse a numbered list from text
 */
export function parseNumberedList(text: string): string[] {
  const lines = text.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match?.[1]) {
      items.push(match[1].trim());
    }
  }

  return items;
}

/**
 * Parse a bullet list from text
 */
export function parseBulletList(text: string): string[] {
  const lines = text.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const match = line.match(/^[-*]\s+(.+)$/);
    if (match?.[1]) {
      items.push(match[1].trim());
    }
  }

  return items;
}

/**
 * Extract a section by header
 */
export function extractSection(text: string, header: string): string | null {
  // Match ## Header or ### Header
  const regex = new RegExp(
    `(?:^|\\n)#{2,3}\\s*${escapeRegex(header)}\\s*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s|$)`,
    'i'
  );
  const match = text.match(regex);
  return match?.[1]?.trim() ?? null;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse key-value pairs from text (e.g., "Key: Value")
 */
export function parseKeyValuePairs(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match?.[1] && match?.[2]) {
      result[match[1].trim()] = match[2].trim();
    }
  }

  return result;
}

/**
 * Wrap content in XML-style tags
 */
export function wrapInTags(content: string, tag: string): string {
  return `<${tag}>\n${content}\n</${tag}>`;
}

/**
 * Common output format instructions
 */
export const OUTPUT_FORMAT_INSTRUCTIONS = {
  useXmlTags: 'Use XML-style tags to structure your response (e.g., <problem_statement>...</problem_statement>)',
  useMarkdown: 'Format your response using Markdown',
  useNumberedLists: 'Use numbered lists for ordered items',
  useBulletLists: 'Use bullet points for unordered items',
  beSpecific: 'Be specific and concrete, avoid vague statements',
  beConcise: 'Be concise but complete',
};

/**
 * Common section templates
 */
export const SECTION_TEMPLATES = {
  context: (projectName: string, description: string) =>
    `Project: ${projectName}\n\n${description}`,

  existingContent: (content: string) =>
    content ? `Here is what has been defined so far:\n\n${content}` : '',

  constraints: (constraints: string[]) =>
    constraints.length > 0
      ? `Keep in mind these constraints:\n${formatBulletList(constraints)}`
      : '',

  focusAreas: (areas: string[]) =>
    areas.length > 0
      ? `Focus on the following:\n${formatBulletList(areas)}`
      : '',
};
