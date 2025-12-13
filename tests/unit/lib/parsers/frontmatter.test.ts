import { describe, it, expect } from 'vitest';
import {
  hasFrontmatter,
  extractFrontmatter,
  parseFrontmatter,
  serializeFrontmatter,
  updateFrontmatter,
  deepMerge,
} from '../../../../src/lib/parsers/frontmatter.js';
import { DocumentParseError } from '../../../../src/types/errors.js';

describe('Frontmatter Parser', () => {
  describe('hasFrontmatter', () => {
    it('should return true for content with frontmatter', () => {
      const content = '---\ntitle: Test\n---\n\n# Content';
      expect(hasFrontmatter(content)).toBe(true);
    });

    it('should return false for content without frontmatter', () => {
      const content = '# Just Markdown';
      expect(hasFrontmatter(content)).toBe(false);
    });

    it('should return false for empty content', () => {
      expect(hasFrontmatter('')).toBe(false);
    });
  });

  describe('extractFrontmatter', () => {
    it('should extract frontmatter and content', () => {
      const content = '---\ntitle: Test\nversion: 1\n---\n\n# Content here';
      const result = extractFrontmatter(content);

      expect(result.raw).toBe('title: Test\nversion: 1');
      expect(result.content).toBe('# Content here');
    });

    it('should handle content without frontmatter', () => {
      const content = '# Just Markdown';
      const result = extractFrontmatter(content);

      expect(result.raw).toBe('');
      expect(result.content).toBe('# Just Markdown');
    });

    it('should throw for unclosed frontmatter', () => {
      const content = '---\ntitle: Test\n# No closing delimiter';

      expect(() => extractFrontmatter(content)).toThrow(DocumentParseError);
    });

    it('should handle empty frontmatter', () => {
      const content = '---\n---\n\n# Content';
      const result = extractFrontmatter(content);

      expect(result.raw).toBe('');
      expect(result.content).toBe('# Content');
    });
  });

  describe('parseFrontmatter', () => {
    it('should parse YAML frontmatter to object', () => {
      const content = '---\ntitle: "My Project"\nversion: 1\nenabled: true\n---\n\n# Content';

      interface Meta {
        title: string;
        version: number;
        enabled: boolean;
      }

      const result = parseFrontmatter<Meta>(content);

      expect(result.data.title).toBe('My Project');
      expect(result.data.version).toBe(1);
      expect(result.data.enabled).toBe(true);
      expect(result.content).toBe('# Content');
    });

    it('should parse nested objects', () => {
      const content = '---\nmeta:\n  name: Test\n  count: 5\n---\n\nBody';

      interface Data {
        meta: { name: string; count: number };
      }

      const result = parseFrontmatter<Data>(content);

      expect(result.data.meta.name).toBe('Test');
      expect(result.data.meta.count).toBe(5);
    });

    it('should throw for invalid YAML', () => {
      const content = '---\ninvalid: yaml: syntax:\n---\n\n# Content';

      expect(() => parseFrontmatter(content)).toThrow(DocumentParseError);
    });

    it('should throw for content without frontmatter', () => {
      const content = '# No frontmatter';

      expect(() => parseFrontmatter(content)).toThrow(DocumentParseError);
    });
  });

  describe('serializeFrontmatter', () => {
    it('should serialize object to frontmatter format', () => {
      const data = { title: 'Test', version: 1 };
      const content = '# My Document';

      const result = serializeFrontmatter(data, content);

      expect(result).toContain('---');
      expect(result).toContain('title: "Test"');
      expect(result).toContain('version: 1');
      expect(result).toContain('# My Document');
    });

    it('should handle nested objects', () => {
      const data = {
        meta: {
          name: 'Test',
          count: 5,
        },
      };

      const result = serializeFrontmatter(data, 'Content');

      expect(result).toContain('meta:');
      expect(result).toContain('name: "Test"');
    });

    it('should round-trip correctly', () => {
      const originalData = {
        title: 'Test Project',
        version: 1,
        enabled: true,
      };
      const originalContent = '# My Document\n\nSome text here.';

      const serialized = serializeFrontmatter(originalData, originalContent);
      const parsed = parseFrontmatter<typeof originalData>(serialized);

      expect(parsed.data.title).toBe(originalData.title);
      expect(parsed.data.version).toBe(originalData.version);
      expect(parsed.data.enabled).toBe(originalData.enabled);
      expect(parsed.content).toBe(originalContent);
    });
  });

  describe('updateFrontmatter', () => {
    it('should update specific fields', () => {
      const original = '---\ntitle: "Old"\nversion: 1\n---\n\n# Content';

      const updated = updateFrontmatter<{ title: string; version: number }>(original, {
        title: 'New',
      });

      expect(updated).toContain('title: "New"');
      expect(updated).toContain('version: 1');
      expect(updated).toContain('# Content');
    });

    it('should add new fields', () => {
      const original = '---\ntitle: "Test"\n---\n\n# Content';

      const updated = updateFrontmatter<{ title: string; newField: string }>(original, {
        newField: 'value',
      });

      expect(updated).toContain('title: "Test"');
      expect(updated).toContain('newField: "value"');
    });

    it('should deep merge nested objects', () => {
      const original = '---\nmeta:\n  name: "Test"\n  count: 5\n---\n\n# Content';

      interface Data {
        meta: { name: string; count: number; extra?: string };
      }

      const updated = updateFrontmatter<Data>(original, {
        meta: { count: 10, extra: 'new' } as Data['meta'],
      });

      const parsed = parseFrontmatter<Data>(updated);

      expect(parsed.data.meta.name).toBe('Test'); // Preserved
      expect(parsed.data.meta.count).toBe(10); // Updated
      expect(parsed.data.meta.extra).toBe('new'); // Added
    });
  });

  describe('deepMerge', () => {
    it('should merge flat objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };

      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should deep merge nested objects', () => {
      const target = { nested: { a: 1, b: 2 } };
      const source = { nested: { b: 3, c: 4 } };

      const result = deepMerge(target, source);

      expect(result.nested).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should replace arrays', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };

      const result = deepMerge(target, source);

      expect(result.arr).toEqual([4, 5]);
    });

    it('should not mutate original objects', () => {
      const target = { a: 1, nested: { b: 2 } };
      const source = { nested: { c: 3 } };

      deepMerge(target, source);

      expect(target).toEqual({ a: 1, nested: { b: 2 } });
    });
  });
});
