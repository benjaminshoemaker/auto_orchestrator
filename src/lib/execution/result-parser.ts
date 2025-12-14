/**
 * Task Result Parser
 * Parses Claude CLI output into structured results
 */

import type { TaskResult, TaskStatus } from '../../types/index.js';

export interface ParsedTaskResult {
  success: boolean;
  filesModified: FileChange[];
  testsInfo?: string;
  criteriaStatus: CriteriaResult[];
  summary: string;
  raw: string;
}

export interface FileChange {
  path: string;
  description: string;
}

export interface CriteriaResult {
  index: number;
  passed: boolean;
  description: string;
  reason?: string;
}

export interface ValidationResult {
  passed: boolean;
  criteriaStatus: CriteriaResult[];
  summary: string;
}

/**
 * Parse task execution output into structured result
 */
export function parseTaskOutput(output: string): ParsedTaskResult {
  const result: ParsedTaskResult = {
    success: false,
    filesModified: [],
    criteriaStatus: [],
    summary: '',
    raw: output,
  };

  // Look for Task Complete marker
  if (output.includes('Task Complete') || output.includes('## Complete')) {
    result.success = true;
  }

  // Extract files modified section
  result.filesModified = extractFilesModified(output);

  // Extract tests info
  result.testsInfo = extractTestsInfo(output);

  // Extract criteria status
  result.criteriaStatus = extractCriteriaStatus(output);

  // Check if all criteria passed
  if (result.criteriaStatus.length > 0) {
    result.success = result.criteriaStatus.every((c) => c.passed);
  }

  // Extract summary
  result.summary = extractSummary(output);

  // If no clear success/fail, look for error indicators
  if (!result.success && result.filesModified.length > 0) {
    // Has file changes but no explicit success - assume partial success
    result.success = !hasErrorIndicators(output);
  }

  return result;
}

/**
 * Parse validation output
 */
export function parseValidationOutput(output: string): ValidationResult {
  const result: ValidationResult = {
    passed: false,
    criteriaStatus: [],
    summary: '',
  };

  // Look for Status: PASS/FAIL
  const statusMatch = output.match(/Status:\s*(PASS|FAIL)/i);
  if (statusMatch) {
    result.passed = statusMatch[1].toUpperCase() === 'PASS';
  }

  // Extract criteria status
  result.criteriaStatus = extractCriteriaStatus(output);

  // If no explicit status, derive from criteria
  if (!statusMatch && result.criteriaStatus.length > 0) {
    result.passed = result.criteriaStatus.every((c) => c.passed);
  }

  // Extract summary
  const summaryMatch = output.match(/### Summary\s*\n([^#]+)/);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  return result;
}

/**
 * Extract files modified from output
 */
function extractFilesModified(output: string): FileChange[] {
  const files: FileChange[] = [];

  // Look for "Files Modified" section
  const sectionMatch = output.match(
    /(?:Files Modified|Modified Files)[:\s]*\n((?:[-*]\s+[^\n]+\n?)+)/i
  );

  if (sectionMatch) {
    const lines = sectionMatch[1].split('\n');
    for (const line of lines) {
      const fileMatch = line.match(/[-*]\s+([^:]+)(?::\s*(.+))?/);
      if (fileMatch) {
        files.push({
          path: fileMatch[1].trim(),
          description: fileMatch[2]?.trim() || '',
        });
      }
    }
  }

  // Also look for file paths mentioned elsewhere
  const pathPattern = /(?:created|modified|updated|added)\s+[`']?([a-zA-Z0-9_./-]+\.[a-zA-Z]+)[`']?/gi;
  let match;
  while ((match = pathPattern.exec(output)) !== null) {
    const path = match[1];
    if (!files.some((f) => f.path === path)) {
      files.push({ path, description: '' });
    }
  }

  return files;
}

/**
 * Extract tests info from output
 */
function extractTestsInfo(output: string): string | undefined {
  const testsMatch = output.match(/### Tests\s*\n([^#]+)/);
  if (testsMatch) {
    return testsMatch[1].trim();
  }

  // Look for test results
  const testResultMatch = output.match(/(\d+)\s+(?:tests?\s+)?pass(?:ed|ing)?/i);
  if (testResultMatch) {
    return `${testResultMatch[1]} tests passing`;
  }

  return undefined;
}

/**
 * Extract criteria status from output
 */
function extractCriteriaStatus(output: string): CriteriaResult[] {
  const criteria: CriteriaResult[] = [];

  // Look for numbered criteria with PASS/FAIL
  const criteriaPattern = /(\d+)\.\s*\[(PASS|FAIL)\]\s*([^-\n]+)(?:-\s*(.+))?/gi;
  let match;

  while ((match = criteriaPattern.exec(output)) !== null) {
    criteria.push({
      index: parseInt(match[1], 10),
      passed: match[2].toUpperCase() === 'PASS',
      description: match[3].trim(),
      reason: match[4]?.trim(),
    });
  }

  // Also look for ✓ and ✗ markers
  const checkPattern = /([✓✗])\s*(.+)/g;
  let checkIndex = 1;
  while ((match = checkPattern.exec(output)) !== null) {
    if (!criteria.some((c) => c.description.includes(match[2].trim()))) {
      criteria.push({
        index: checkIndex++,
        passed: match[1] === '✓',
        description: match[2].trim(),
      });
    }
  }

  return criteria;
}

/**
 * Extract summary from output
 */
function extractSummary(output: string): string {
  // Look for explicit summary section
  const summaryMatch = output.match(/### Summary\s*\n([^#]+)/);
  if (summaryMatch) {
    return summaryMatch[1].trim();
  }

  // Look for "completed" or "done" statements
  const completedMatch = output.match(
    /(?:Task|Implementation)\s+(?:is\s+)?(?:complete|completed|done)[.!]?\s*([^\n]+)?/i
  );
  if (completedMatch) {
    return completedMatch[0].trim();
  }

  // Use last paragraph as summary
  const paragraphs = output.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length > 0) {
    const lastPara = paragraphs[paragraphs.length - 1].trim();
    if (lastPara.length < 500) {
      return lastPara;
    }
  }

  return '';
}

/**
 * Check for error indicators in output
 */
function hasErrorIndicators(output: string): boolean {
  const errorPatterns = [
    /error:/i,
    /failed:/i,
    /exception:/i,
    /could not/i,
    /unable to/i,
    /FAIL\]/,
    /✗/,
    /❌/,
  ];

  return errorPatterns.some((pattern) => pattern.test(output));
}

/**
 * Convert parsed result to TaskResult for storage
 */
export function toTaskResult(
  taskId: string,
  parsed: ParsedTaskResult,
  duration: number,
  cost: number = 0
): TaskResult {
  return {
    task_id: taskId,
    status: parsed.success ? 'complete' : 'failed',
    started_at: new Date(Date.now() - duration).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: duration,
    output_summary: parsed.summary,
    files_modified: parsed.filesModified.map((f) => f.path),
    tests_passed: parsed.testsInfo ? !parsed.testsInfo.includes('fail') : undefined,
    tokens_used: 0,
    cost_usd: cost,
    raw_output: parsed.raw.slice(0, 10000), // Limit stored raw output
  };
}
