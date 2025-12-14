/**
 * Task Result Parser
 * Parses Claude CLI output into structured results
 */

import type { TaskResult } from '../../types/index.js';

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
  if (statusMatch && statusMatch[1]) {
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
  if (summaryMatch && summaryMatch[1]) {
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

  if (sectionMatch && sectionMatch[1]) {
    const lines = sectionMatch[1].split('\n');
    for (const line of lines) {
      const fileMatch = line.match(/[-*]\s+([^:]+)(?::\s*(.+))?/);
      if (fileMatch && fileMatch[1]) {
        files.push({
          path: fileMatch[1].trim(),
          description: fileMatch[2]?.trim() || '',
        });
      }
    }
  }

  // Also look for file paths mentioned elsewhere
  const pathPattern = /(?:created|modified|updated|added)\s+[`']?([a-zA-Z0-9_./-]+\.[a-zA-Z]+)[`']?/gi;
  let pathMatch: RegExpExecArray | null;
  while ((pathMatch = pathPattern.exec(output)) !== null) {
    const filePath = pathMatch[1];
    if (filePath && !files.some((f) => f.path === filePath)) {
      files.push({ path: filePath, description: '' });
    }
  }

  return files;
}

/**
 * Extract tests info from output
 */
function extractTestsInfo(output: string): string | undefined {
  const testsMatch = output.match(/### Tests\s*\n([^#]+)/);
  if (testsMatch && testsMatch[1]) {
    return testsMatch[1].trim();
  }

  // Look for test results
  const testResultMatch = output.match(/(\d+)\s+(?:tests?\s+)?pass(?:ed|ing)?/i);
  if (testResultMatch && testResultMatch[1]) {
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
  let match: RegExpExecArray | null;

  while ((match = criteriaPattern.exec(output)) !== null) {
    if (match[1] && match[2] && match[3]) {
      criteria.push({
        index: parseInt(match[1], 10),
        passed: match[2].toUpperCase() === 'PASS',
        description: match[3].trim(),
        reason: match[4]?.trim(),
      });
    }
  }

  // Also look for ✓ and ✗ markers
  const checkPattern = /([✓✗])\s*(.+)/g;
  let checkIndex = 1;
  let checkMatch: RegExpExecArray | null;
  while ((checkMatch = checkPattern.exec(output)) !== null) {
    if (checkMatch[1] && checkMatch[2]) {
      const desc = checkMatch[2].trim();
      if (!criteria.some((c) => c.description.includes(desc))) {
        criteria.push({
          index: checkIndex++,
          passed: checkMatch[1] === '✓',
          description: desc,
        });
      }
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
  if (summaryMatch && summaryMatch[1]) {
    return summaryMatch[1].trim();
  }

  // Look for "completed" or "done" statements
  const completedMatch = output.match(
    /(?:Task|Implementation)\s+(?:is\s+)?(?:complete|completed|done)[.!]?\s*([^\n]+)?/i
  );
  if (completedMatch && completedMatch[0]) {
    return completedMatch[0].trim();
  }

  // Use last paragraph as summary
  const paragraphs = output.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length > 0) {
    const lastPara = paragraphs[paragraphs.length - 1];
    if (lastPara && lastPara.trim().length < 500) {
      return lastPara.trim();
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
