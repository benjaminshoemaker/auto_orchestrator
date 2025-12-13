import { describe, it, expect } from 'vitest';
import { VERSION, PACKAGE_NAME } from '../../src/constants.js';

describe('Constants', () => {
  it('should export VERSION constant', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('should have correct version format', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should have correct package name', () => {
    expect(PACKAGE_NAME).toBe('@orchestrator/cli');
  });
});
