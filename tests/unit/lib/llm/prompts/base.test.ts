import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  buildSystemPrompt,
  formatNumberedList,
  formatBulletList,
  extractTagContent,
  extractAllTagContent,
  parseNumberedList,
  parseBulletList,
  extractSection,
  parseKeyValuePairs,
  wrapInTags,
  OUTPUT_FORMAT_INSTRUCTIONS,
  SECTION_TEMPLATES,
} from '../../../../../src/lib/llm/prompts/base.js';

describe('Prompt Base Utilities', () => {
  describe('buildPrompt', () => {
    it('should build prompt from sections', () => {
      const sections = [
        { title: 'Context', content: 'Project background' },
        { title: 'Task', content: 'What to do' },
      ];

      const prompt = buildPrompt(sections);

      expect(prompt).toContain('## Context');
      expect(prompt).toContain('Project background');
      expect(prompt).toContain('## Task');
      expect(prompt).toContain('What to do');
    });

    it('should skip empty sections', () => {
      const sections = [
        { title: 'Context', content: 'Project background' },
        { title: 'Empty', content: '' },
        { title: 'Task', content: 'What to do' },
      ];

      const prompt = buildPrompt(sections);

      expect(prompt).not.toContain('## Empty');
    });

    it('should handle whitespace-only sections', () => {
      const sections = [
        { title: 'Context', content: 'Background' },
        { title: 'Whitespace', content: '   \n\t  ' },
      ];

      const prompt = buildPrompt(sections);

      expect(prompt).not.toContain('## Whitespace');
    });
  });

  describe('buildSystemPrompt', () => {
    it('should build system prompt with role and instructions', () => {
      const prompt = buildSystemPrompt('a helpful assistant', [
        'Be concise',
        'Be accurate',
      ]);

      expect(prompt).toContain('You are a helpful assistant.');
      expect(prompt).toContain('Be concise');
      expect(prompt).toContain('Be accurate');
    });
  });

  describe('formatNumberedList', () => {
    it('should format items as numbered list', () => {
      const items = ['First', 'Second', 'Third'];
      const result = formatNumberedList(items);

      expect(result).toBe('1. First\n2. Second\n3. Third');
    });

    it('should handle empty list', () => {
      expect(formatNumberedList([])).toBe('');
    });

    it('should handle single item', () => {
      expect(formatNumberedList(['Only'])).toBe('1. Only');
    });
  });

  describe('formatBulletList', () => {
    it('should format items as bullet list', () => {
      const items = ['Item 1', 'Item 2', 'Item 3'];
      const result = formatBulletList(items);

      expect(result).toBe('- Item 1\n- Item 2\n- Item 3');
    });

    it('should handle empty list', () => {
      expect(formatBulletList([])).toBe('');
    });
  });

  describe('extractTagContent', () => {
    it('should extract content between tags', () => {
      const text = '<problem>This is the problem</problem>';
      const result = extractTagContent(text, 'problem');

      expect(result).toBe('This is the problem');
    });

    it('should extract multiline content', () => {
      const text = `<description>
Line 1
Line 2
</description>`;
      const result = extractTagContent(text, 'description');

      expect(result).toBe('Line 1\nLine 2');
    });

    it('should return null if tag not found', () => {
      const text = '<other>Content</other>';
      const result = extractTagContent(text, 'problem');

      expect(result).toBeNull();
    });

    it('should handle case-insensitive tags', () => {
      const text = '<PROBLEM>Content</PROBLEM>';
      const result = extractTagContent(text, 'problem');

      expect(result).toBe('Content');
    });

    it('should extract first occurrence only', () => {
      const text = '<tag>First</tag><tag>Second</tag>';
      const result = extractTagContent(text, 'tag');

      expect(result).toBe('First');
    });
  });

  describe('extractAllTagContent', () => {
    it('should extract all occurrences', () => {
      const text = '<item>First</item><item>Second</item><item>Third</item>';
      const result = extractAllTagContent(text, 'item');

      expect(result).toEqual(['First', 'Second', 'Third']);
    });

    it('should return empty array if no matches', () => {
      const text = '<other>Content</other>';
      const result = extractAllTagContent(text, 'item');

      expect(result).toEqual([]);
    });

    it('should handle multiline content in each tag', () => {
      const text = `<item>
Line 1
Line 2
</item>
<item>
Line 3
</item>`;
      const result = extractAllTagContent(text, 'item');

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('Line 1');
      expect(result[0]).toContain('Line 2');
    });
  });

  describe('parseNumberedList', () => {
    it('should parse numbered items', () => {
      const text = `1. First item
2. Second item
3. Third item`;
      const result = parseNumberedList(text);

      expect(result).toEqual(['First item', 'Second item', 'Third item']);
    });

    it('should skip non-numbered lines', () => {
      const text = `1. Item one
Some text
2. Item two`;
      const result = parseNumberedList(text);

      expect(result).toEqual(['Item one', 'Item two']);
    });

    it('should handle double-digit numbers', () => {
      const text = `10. Item ten
11. Item eleven`;
      const result = parseNumberedList(text);

      expect(result).toEqual(['Item ten', 'Item eleven']);
    });
  });

  describe('parseBulletList', () => {
    it('should parse bullet items with dashes', () => {
      const text = `- First
- Second
- Third`;
      const result = parseBulletList(text);

      expect(result).toEqual(['First', 'Second', 'Third']);
    });

    it('should parse bullet items with asterisks', () => {
      const text = `* Item 1
* Item 2`;
      const result = parseBulletList(text);

      expect(result).toEqual(['Item 1', 'Item 2']);
    });

    it('should skip non-bullet lines', () => {
      const text = `- Item
Header
- Another`;
      const result = parseBulletList(text);

      expect(result).toEqual(['Item', 'Another']);
    });
  });

  describe('extractSection', () => {
    it('should extract section by header', () => {
      const text = `## Introduction
This is the intro.

## Details
These are details.`;
      const result = extractSection(text, 'Details');

      expect(result).toBe('These are details.');
    });

    it('should handle ### headers', () => {
      const text = `### Section
Content here`;
      const result = extractSection(text, 'Section');

      expect(result).toBe('Content here');
    });

    it('should return null if not found', () => {
      const text = `## Other
Content`;
      const result = extractSection(text, 'Missing');

      expect(result).toBeNull();
    });

    it('should stop at next header', () => {
      const text = `## First
Content 1

## Second
Content 2`;
      const result = extractSection(text, 'First');

      expect(result).toBe('Content 1');
      expect(result).not.toContain('Content 2');
    });
  });

  describe('parseKeyValuePairs', () => {
    it('should parse key-value pairs', () => {
      const text = `Name: John
Age: 30
City: New York`;
      const result = parseKeyValuePairs(text);

      expect(result).toEqual({
        Name: 'John',
        Age: '30',
        City: 'New York',
      });
    });

    it('should skip lines without colons', () => {
      const text = `Name: John
Some comment
Age: 30`;
      const result = parseKeyValuePairs(text);

      expect(result).toEqual({
        Name: 'John',
        Age: '30',
      });
    });

    it('should handle values with colons', () => {
      const text = `Time: 10:30 AM`;
      const result = parseKeyValuePairs(text);

      expect(result).toEqual({
        Time: '10:30 AM',
      });
    });
  });

  describe('wrapInTags', () => {
    it('should wrap content in tags', () => {
      const result = wrapInTags('Content here', 'section');
      expect(result).toBe('<section>\nContent here\n</section>');
    });
  });

  describe('OUTPUT_FORMAT_INSTRUCTIONS', () => {
    it('should have all expected instructions', () => {
      expect(OUTPUT_FORMAT_INSTRUCTIONS.useXmlTags).toBeDefined();
      expect(OUTPUT_FORMAT_INSTRUCTIONS.useMarkdown).toBeDefined();
      expect(OUTPUT_FORMAT_INSTRUCTIONS.useNumberedLists).toBeDefined();
      expect(OUTPUT_FORMAT_INSTRUCTIONS.useBulletLists).toBeDefined();
      expect(OUTPUT_FORMAT_INSTRUCTIONS.beSpecific).toBeDefined();
      expect(OUTPUT_FORMAT_INSTRUCTIONS.beConcise).toBeDefined();
    });
  });

  describe('SECTION_TEMPLATES', () => {
    it('should generate context template', () => {
      const result = SECTION_TEMPLATES.context('MyProject', 'A cool project');
      expect(result).toContain('MyProject');
      expect(result).toContain('A cool project');
    });

    it('should handle empty existing content', () => {
      const result = SECTION_TEMPLATES.existingContent('');
      expect(result).toBe('');
    });

    it('should format existing content', () => {
      const result = SECTION_TEMPLATES.existingContent('Some content');
      expect(result).toContain('what has been defined');
      expect(result).toContain('Some content');
    });

    it('should format constraints', () => {
      const result = SECTION_TEMPLATES.constraints(['Constraint 1', 'Constraint 2']);
      expect(result).toContain('- Constraint 1');
      expect(result).toContain('- Constraint 2');
    });

    it('should handle empty constraints', () => {
      const result = SECTION_TEMPLATES.constraints([]);
      expect(result).toBe('');
    });

    it('should format focus areas', () => {
      const result = SECTION_TEMPLATES.focusAreas(['Area 1', 'Area 2']);
      expect(result).toContain('- Area 1');
      expect(result).toContain('- Area 2');
    });
  });
});
