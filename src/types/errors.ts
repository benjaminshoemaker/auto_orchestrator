/**
 * Base error class for all orchestrator errors.
 * All custom errors should extend this class.
 */
export class OrchestratorError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'OrchestratorError';
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when parsing documents (PROJECT.md, YAML frontmatter, etc.)
 */
export class DocumentParseError extends OrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DOC_PARSE_ERROR', context);
    this.name = 'DocumentParseError';
  }

  static yamlInvalid(details: string, line?: number): DocumentParseError {
    return new DocumentParseError(`Invalid YAML: ${details}`, {
      type: 'yaml_invalid',
      line,
      details,
    });
  }

  static missingField(field: string): DocumentParseError {
    return new DocumentParseError(`Missing required field: ${field}`, {
      type: 'missing_field',
      field,
    });
  }

  static invalidStructure(details: string): DocumentParseError {
    return new DocumentParseError(`Invalid document structure: ${details}`, {
      type: 'invalid_structure',
      details,
    });
  }

  static alreadyExists(path: string): DocumentParseError {
    return new DocumentParseError(`Document already exists: ${path}`, {
      type: 'already_exists',
      path,
    });
  }
}

/**
 * Error thrown when state transitions are invalid
 */
export class StateError extends OrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STATE_ERROR', context);
    this.name = 'StateError';
  }

  static invalidTransition(from: string, to: string): StateError {
    return new StateError(`Invalid state transition from "${from}" to "${to}"`, {
      type: 'invalid_transition',
      from,
      to,
    });
  }

  static notLoaded(): StateError {
    return new StateError('State not loaded. Call load() first.', {
      type: 'not_loaded',
    });
  }

  static taskNotFound(taskId: string): StateError {
    return new StateError(`Task not found: ${taskId}`, {
      type: 'task_not_found',
      taskId,
    });
  }

  static taskNotFailed(taskId: string, currentStatus: string): StateError {
    return new StateError(
      `Task ${taskId} is not in failed status (current: ${currentStatus}). Only failed tasks can be retried.`,
      {
        type: 'task_not_failed',
        taskId,
        currentStatus,
      }
    );
  }
}

/**
 * Error thrown when task execution fails
 */
export class TaskExecutionError extends OrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TASK_EXEC_ERROR', context);
    this.name = 'TaskExecutionError';
  }

  static timeout(taskId: string, timeoutMs: number): TaskExecutionError {
    return new TaskExecutionError(`Task ${taskId} timed out after ${timeoutMs}ms`, {
      type: 'timeout',
      taskId,
      timeoutMs,
    });
  }

  static executionFailed(taskId: string, exitCode: number, stderr: string): TaskExecutionError {
    return new TaskExecutionError(`Task ${taskId} failed with exit code ${exitCode}`, {
      type: 'execution_failed',
      taskId,
      exitCode,
      stderr,
    });
  }

  static parseError(taskId: string, details: string): TaskExecutionError {
    return new TaskExecutionError(`Failed to parse result for task ${taskId}: ${details}`, {
      type: 'parse_error',
      taskId,
      details,
    });
  }
}

/**
 * Error thrown when sub-agent validation fails
 */
export class ValidationError extends OrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }

  static criteriaNotMet(taskId: string, failedCriteria: string[]): ValidationError {
    return new ValidationError(`Task ${taskId} did not meet acceptance criteria`, {
      type: 'criteria_not_met',
      taskId,
      failedCriteria,
    });
  }

  static validatorFailed(taskId: string, details: string): ValidationError {
    return new ValidationError(`Validation failed for task ${taskId}: ${details}`, {
      type: 'validator_failed',
      taskId,
      details,
    });
  }
}

/**
 * Error thrown when Git operations fail
 */
export class GitError extends OrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'GIT_ERROR', context);
    this.name = 'GitError';
  }

  static notRepo(path: string): GitError {
    return new GitError(`Not a git repository: ${path}`, {
      type: 'not_repo',
      path,
    });
  }

  static operationFailed(operation: string, details: string): GitError {
    return new GitError(`Git ${operation} failed: ${details}`, {
      type: 'operation_failed',
      operation,
      details,
    });
  }
}

/**
 * Error thrown when LLM API calls fail
 */
export class LLMError extends OrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LLM_ERROR', context);
    this.name = 'LLMError';
  }

  static apiKeyMissing(): LLMError {
    return new LLMError('ANTHROPIC_API_KEY environment variable not set', {
      type: 'api_key_missing',
    });
  }

  static apiError(statusCode: number, details: string, requestId?: string): LLMError {
    return new LLMError(`LLM API error (${statusCode}): ${details}`, {
      type: 'api_error',
      statusCode,
      details,
      requestId,
    });
  }

  static rateLimited(retryAfter?: number): LLMError {
    return new LLMError('Rate limited by LLM API', {
      type: 'rate_limited',
      retryAfter,
    });
  }

  static parseError(details: string): LLMError {
    return new LLMError(`Failed to parse LLM response: ${details}`, {
      type: 'parse_error',
      details,
    });
  }
}
