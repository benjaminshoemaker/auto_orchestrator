import * as yaml from 'yaml';
import { DocumentParseError } from '../../types/errors.js';

/**
 * Result of extracting frontmatter from a document
 */
export interface FrontmatterResult<T = unknown> {
  data: T;
  content: string;
  raw: string;
}

/**
 * Check if content has YAML frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return content.startsWith('---\n');
}

/**
 * Extract frontmatter from markdown content
 * Frontmatter is YAML between --- delimiters at the start of the file
 */
export function extractFrontmatter(content: string): FrontmatterResult<string> {
  if (!hasFrontmatter(content)) {
    return {
      data: '',
      content: content,
      raw: '',
    };
  }

  // After opening ---\n, content starts at position 4
  // The closing --- could be immediately at position 4 (empty frontmatter)
  // or preceded by \n (after YAML content)

  let endIndex: number;
  let raw: string;

  // Check for empty frontmatter: ---\n---
  if (content.substring(4, 7) === '---') {
    endIndex = 4;
    raw = '';
  } else {
    // Find \n--- for closing delimiter
    endIndex = content.indexOf('\n---', 4);
    if (endIndex === -1) {
      throw DocumentParseError.yamlInvalid('No closing frontmatter delimiter found');
    }
    raw = content.substring(4, endIndex);
  }

  const afterDelimiter = endIndex + 4; // Skip past ---\n or \n---
  const markdownContent = content.substring(afterDelimiter).replace(/^\n+/, '');

  return {
    data: raw,
    content: markdownContent.trim(),
    raw,
  };
}

/**
 * Parse YAML frontmatter into typed object
 */
export function parseFrontmatter<T>(content: string): FrontmatterResult<T> {
  const extracted = extractFrontmatter(content);

  if (!extracted.raw) {
    throw DocumentParseError.yamlInvalid('No frontmatter found');
  }

  try {
    const data = yaml.parse(extracted.raw) as T;
    return {
      data,
      content: extracted.content,
      raw: extracted.raw,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw DocumentParseError.yamlInvalid(message);
  }
}

/**
 * Serialize object to YAML frontmatter format
 */
export function serializeFrontmatter<T extends Record<string, unknown>>(
  data: T,
  content: string
): string {
  const yamlStr = yaml.stringify(data, {
    lineWidth: 0, // Don't wrap lines
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  });

  return `---\n${yamlStr}---\n\n${content}`;
}

/**
 * Update frontmatter while preserving content
 * Automatically updates the 'updated' timestamp field
 */
export function updateFrontmatter<T extends Record<string, unknown>>(
  document: string,
  updates: Partial<T>
): string {
  const { data, content } = parseFrontmatter<T>(document);

  // Auto-update the 'updated' timestamp
  const updatesWithTimestamp = {
    ...updates,
    updated: new Date().toISOString(),
  } as Partial<T>;

  const merged = deepMerge(data as Record<string, unknown>, updatesWithTimestamp as Record<string, unknown>);
  return serializeFrontmatter(merged as T, content);
}

/**
 * Deep merge two objects
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }

  return result;
}
