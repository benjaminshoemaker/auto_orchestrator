import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PhaseRunner,
  type PhaseRunnerConfig,
  type PhaseResult,
} from '../../../../src/lib/phases/phase-runner.js';

// Concrete implementation for testing
class TestPhaseRunner extends PhaseRunner<string, { value: string }> {
  public phaseCost = 0.5;
  public setupCalled = false;
  public executeCalled = false;
  public persistCalled = false;
  public shouldFail = false;
  public executeResult = { value: 'test-result' };

  protected getPhaseNumber(): number {
    return 1;
  }

  protected getPhaseName(): string {
    return 'Test Phase';
  }

  protected async setup(_input: string): Promise<void> {
    this.setupCalled = true;
  }

  protected async execute(_input: string): Promise<{ value: string }> {
    this.executeCalled = true;
    if (this.shouldFail) {
      throw new Error('Test execution failed');
    }
    return this.executeResult;
  }

  protected async persist(_result: { value: string }): Promise<void> {
    this.persistCalled = true;
  }

  protected getCost(): number {
    return this.phaseCost;
  }
}

describe('PhaseRunner', () => {
  let mockConfig: PhaseRunnerConfig;
  let runner: TestPhaseRunner;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock the config with minimal implementations
    mockConfig = {
      llmService: {} as PhaseRunnerConfig['llmService'],
      stateManager: {} as PhaseRunnerConfig['stateManager'],
      documentManager: {} as PhaseRunnerConfig['documentManager'],
    };

    runner = new TestPhaseRunner(mockConfig);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('run()', () => {
    it('should call lifecycle methods in correct order', async () => {
      const result = await runner.run('test-input');

      expect(runner.setupCalled).toBe(true);
      expect(runner.executeCalled).toBe(true);
      expect(runner.persistCalled).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should return success result with data', async () => {
      const result = await runner.run('test-input');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 'test-result' });
      expect(result.error).toBeUndefined();
    });

    it('should return cost in result', async () => {
      runner.phaseCost = 1.25;
      const result = await runner.run('test-input');

      expect(result.cost).toBe(1.25);
    });

    it('should catch errors and return failure result', async () => {
      runner.shouldFail = true;

      const result = await runner.run('test-input');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test execution failed');
      expect(result.data).toBeUndefined();
    });

    it('should still return cost on failure', async () => {
      runner.shouldFail = true;
      runner.phaseCost = 0.75;

      const result = await runner.run('test-input');

      expect(result.cost).toBe(0.75);
    });

    it('should not call persist if execute fails', async () => {
      runner.shouldFail = true;

      await runner.run('test-input');

      expect(runner.setupCalled).toBe(true);
      expect(runner.executeCalled).toBe(true);
      expect(runner.persistCalled).toBe(false);
    });

    it('should show header on run', async () => {
      await runner.run('test-input');

      // Check that console.log was called with something containing phase info
      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Phase 1');
      expect(calls).toContain('Test Phase');
    });

    it('should show success message on completion', async () => {
      await runner.run('test-input');

      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('complete');
    });

    it('should show error message on failure', async () => {
      runner.shouldFail = true;

      await runner.run('test-input');

      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('failed');
    });
  });

  describe('custom execute result', () => {
    it('should use custom execute result', async () => {
      runner.executeResult = { value: 'custom-value' };

      const result = await runner.run('test-input');

      expect(result.data).toEqual({ value: 'custom-value' });
    });
  });
});

// Test with a second phase to ensure phase number is configurable
class Phase2Runner extends PhaseRunner<void, string> {
  protected getPhaseNumber(): number {
    return 2;
  }

  protected getPhaseName(): string {
    return 'Second Phase';
  }

  protected async setup(): Promise<void> {}

  protected async execute(): Promise<string> {
    return 'result';
  }

  protected async persist(): Promise<void> {}

  protected getCost(): number {
    return 0;
  }
}

describe('PhaseRunner with different phase numbers', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should display correct phase number', async () => {
    const mockConfig = {
      llmService: {} as PhaseRunnerConfig['llmService'],
      stateManager: {} as PhaseRunnerConfig['stateManager'],
      documentManager: {} as PhaseRunnerConfig['documentManager'],
    };

    const runner = new Phase2Runner(mockConfig);
    await runner.run();

    const calls = consoleLogSpy.mock.calls.flat().join(' ');
    expect(calls).toContain('Phase 2');
    expect(calls).toContain('Second Phase');
  });
});
