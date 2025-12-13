import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as terminal from '../../../../src/lib/ui/terminal.js';

describe('Terminal UI utilities', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    stdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  describe('formatCost', () => {
    it('should format zero cost', () => {
      expect(terminal.formatCost(0)).toBe('$0.00');
    });

    it('should format small cost', () => {
      expect(terminal.formatCost(0.05)).toBe('$0.05');
    });

    it('should format cost with cents', () => {
      expect(terminal.formatCost(1.23)).toBe('$1.23');
    });

    it('should format larger cost', () => {
      expect(terminal.formatCost(15.5)).toBe('$15.50');
    });

    it('should round to two decimal places', () => {
      expect(terminal.formatCost(1.999)).toBe('$2.00');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds only', () => {
      expect(terminal.formatDuration(45)).toBe('45s');
    });

    it('should format single second', () => {
      expect(terminal.formatDuration(1)).toBe('1s');
    });

    it('should format exactly one minute', () => {
      expect(terminal.formatDuration(60)).toBe('1m');
    });

    it('should format minutes and seconds', () => {
      expect(terminal.formatDuration(150)).toBe('2m 30s');
    });

    it('should format just minutes when seconds are 0', () => {
      expect(terminal.formatDuration(120)).toBe('2m');
    });

    it('should handle large durations', () => {
      expect(terminal.formatDuration(3661)).toBe('61m 1s');
    });

    it('should round fractional seconds', () => {
      expect(terminal.formatDuration(45.7)).toBe('46s');
    });
  });

  describe('formatTaskStatus', () => {
    it('should format pending status', () => {
      const result = terminal.formatTaskStatus('pending');
      expect(result).toContain('pending');
      expect(result).toContain('⏳');
    });

    it('should format in_progress status', () => {
      const result = terminal.formatTaskStatus('in_progress');
      expect(result).toContain('in progress');
      expect(result).toContain('🔄');
    });

    it('should format complete status', () => {
      const result = terminal.formatTaskStatus('complete');
      expect(result).toContain('complete');
      expect(result).toContain('✅');
    });

    it('should format failed status', () => {
      const result = terminal.formatTaskStatus('failed');
      expect(result).toContain('failed');
      expect(result).toContain('❌');
    });

    it('should format skipped status', () => {
      const result = terminal.formatTaskStatus('skipped');
      expect(result).toContain('skipped');
      expect(result).toContain('⏭️');
    });
  });

  describe('printHeader', () => {
    it('should print header with title', () => {
      terminal.printHeader('Test Header');
      // Called 3 times: empty line, title, empty line
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('printSection', () => {
    it('should print section with title and content', () => {
      terminal.printSection('Title', 'Content here');
      expect(consoleLogSpy).toHaveBeenCalled();
      // Check the first call contains the title
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Title');
    });

    it('should handle multi-line content', () => {
      terminal.printSection('Title', 'Line 1\nLine 2\nLine 3');
      // Title + 3 content lines + empty line = 5 calls
      expect(consoleLogSpy).toHaveBeenCalledTimes(5);
    });

    it('should handle empty content', () => {
      terminal.printSection('Title', '');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('printSuccess', () => {
    it('should print success message with checkmark', () => {
      terminal.printSuccess('Operation completed');
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('✔');
      expect(output).toContain('Operation completed');
    });
  });

  describe('printError', () => {
    it('should print error message with X', () => {
      terminal.printError('Something failed');
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('✖');
      expect(output).toContain('Something failed');
    });
  });

  describe('printWarning', () => {
    it('should print warning message', () => {
      terminal.printWarning('Be careful');
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('⚠');
      expect(output).toContain('Be careful');
    });
  });

  describe('printInfo', () => {
    it('should print info message', () => {
      terminal.printInfo('FYI');
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('ℹ');
      expect(output).toContain('FYI');
    });
  });

  describe('printProgress', () => {
    it('should print progress bar at 0%', () => {
      terminal.printProgress(0, 10);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('0%');
    });

    it('should print progress bar at 50%', () => {
      terminal.printProgress(5, 10);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('50%');
    });

    it('should print progress bar at 100%', () => {
      terminal.printProgress(10, 10);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('100%');
    });

    it('should include label when provided', () => {
      terminal.printProgress(5, 10, 'Processing');
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Processing');
    });
  });

  describe('createSpinner', () => {
    it('should create a spinner with text', () => {
      const spinner = terminal.createSpinner('Loading...');
      expect(spinner).toBeDefined();
      expect(spinner.text).toBe('Loading...');
    });
  });

  describe('streamToken', () => {
    it('should write token to stdout without newline', () => {
      terminal.streamToken('Hello');
      expect(stdoutWriteSpy).toHaveBeenCalledWith('Hello');
    });
  });

  describe('endStream', () => {
    it('should print empty line', () => {
      terminal.endStream();
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('printAssistantMessage', () => {
    it('should print formatted assistant message', () => {
      terminal.printAssistantMessage('Hello, I am Claude');
      expect(consoleLogSpy).toHaveBeenCalled();
      // Check for assistant marker
      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('🤖');
      expect(calls).toContain('Assistant');
    });
  });

  describe('printUserPrompt', () => {
    it('should return user prompt string', () => {
      const prompt = terminal.printUserPrompt();
      expect(prompt).toContain('👤');
      expect(prompt).toContain('You');
    });
  });

  // Note: prompt, confirm, and select functions require mocking inquirer
  // which is complex. We test them through integration tests instead.
});
