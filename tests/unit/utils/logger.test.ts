import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, setVerbose, isVerbose } from '../../../src/utils/logger.js';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setVerbose(false);
    delete process.env.DEBUG;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('log levels', () => {
    it('should output log messages', () => {
      logger.log('test message');
      expect(consoleSpy).toHaveBeenCalledWith('test message');
    });

    it('should output info messages with icon', () => {
      logger.info('info message');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call?.join(' ')).toContain('info message');
    });

    it('should output success messages with icon', () => {
      logger.success('success message');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call?.join(' ')).toContain('success message');
    });

    it('should output warn messages with icon', () => {
      logger.warn('warn message');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call?.join(' ')).toContain('warn message');
    });

    it('should output error messages with icon', () => {
      logger.error('error message');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call?.join(' ')).toContain('error message');
    });
  });

  describe('verbose mode', () => {
    it('should not output verbose when disabled', () => {
      setVerbose(false);
      logger.verbose('verbose message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should output verbose when enabled', () => {
      setVerbose(true);
      logger.verbose('verbose message');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call?.join(' ')).toContain('verbose message');
    });

    it('should track verbose state correctly', () => {
      expect(isVerbose()).toBe(false);
      setVerbose(true);
      expect(isVerbose()).toBe(true);
      setVerbose(false);
      expect(isVerbose()).toBe(false);
    });
  });

  describe('debug mode', () => {
    it('should not output debug when DEBUG not set', () => {
      delete process.env.DEBUG;
      logger.debug('debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should output debug when DEBUG is set', () => {
      process.env.DEBUG = '1';
      logger.debug('debug message');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call?.join(' ')).toContain('debug message');
    });
  });
});
