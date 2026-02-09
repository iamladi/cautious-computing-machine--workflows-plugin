/**
 * Parse XML-style signals from Claude CLI output
 */

import type { WorkflowEvent, WorkflowSignal } from '../types';

const PHASE_SIGNALS: WorkflowSignal[] = [
  'SETUP_COMPLETE',
  'PLANNING_COMPLETE',
  'IMPLEMENTATION_COMPLETE',
  'PR_CREATED',
  'CI_PASSED',
  'CI_FAILED',
  'CI_FIX_PUSHED',
  'COMMENTS_RESOLVED',
  'COMMENTS_PENDING',
  'COMMENT_FIX_PUSHED',
  'WORKFLOW_COMPLETE',
];

/**
 * Parse signals from Claude CLI output.
 * Looks for patterns like:
 * - <phase>SETUP_COMPLETE</phase>
 * - <plan>PLAN_1_COMPLETE</plan>
 * - <promise>FAILED</promise>
 * - <error>message</error>
 */
export function parseSignals(output: string): WorkflowEvent | null {
  // Check for phase signals: <phase>SIGNAL_NAME</phase>
  const phaseMatch = output.match(/<phase>(\w+)<\/phase>/);
  if (phaseMatch) {
    const signalName = phaseMatch[1] as WorkflowSignal;
    if (PHASE_SIGNALS.includes(signalName)) {
      return { type: signalName };
    }
  }

  // Check for plan completion: <plan>PLAN_N_COMPLETE</plan>
  const planMatch = output.match(/<plan>PLAN_(\d+)_COMPLETE<\/plan>/);
  if (planMatch) {
    const planNumber = parseInt(planMatch[1], 10);
    return {
      type: 'PLAN_COMPLETE',
      data: { planNumber },
    };
  }

  // Check for promise failure: <promise>FAILED</promise>
  if (output.includes('<promise>FAILED</promise>')) {
    const errorMatch = output.match(/<error>([^<]+)<\/error>/);
    return {
      type: 'FAIL',
      error: errorMatch ? errorMatch[1] : 'Unknown error',
    };
  }

  // Check for workflow complete promise
  if (output.includes('<promise>COMPLETE</promise>')) {
    return { type: 'WORKFLOW_COMPLETE' };
  }

  return null;
}

/**
 * Extract additional data from output based on signal type
 */
export function extractSignalData(
  output: string,
  signal: string
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  switch (signal) {
    case 'SETUP_COMPLETE': {
      const pathMatch = output.match(/worktree_path:\s*(.+)/);
      const branchMatch = output.match(/branch:\s*(.+)/);
      if (pathMatch) data.worktreePath = pathMatch[1].trim();
      if (branchMatch) data.branch = branchMatch[1].trim();
      break;
    }

    case 'PLANNING_COMPLETE': {
      const countMatch = output.match(/plans_count:\s*(\d+)/);
      if (countMatch) data.plansCount = parseInt(countMatch[1], 10);
      break;
    }

    case 'PR_CREATED': {
      const urlMatch = output.match(/pr_url:\s*(.+)/);
      const numberMatch = output.match(/pr_number:\s*(\d+)/);
      if (urlMatch) data.prUrl = urlMatch[1].trim();
      if (numberMatch) data.prNumber = parseInt(numberMatch[1], 10);
      break;
    }

    case 'CI_FAILED': {
      const reasonMatch = output.match(/ci_failure_reason:\s*(.+)/);
      if (reasonMatch) data.failureReason = reasonMatch[1].trim();
      break;
    }
  }

  return data;
}

/**
 * Find all signals in output (there may be multiple)
 */
export function parseAllSignals(output: string): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];

  // Find all phase signals
  const phaseMatches = output.matchAll(/<phase>(\w+)<\/phase>/g);
  for (const match of phaseMatches) {
    const signalName = match[1] as WorkflowSignal;
    if (PHASE_SIGNALS.includes(signalName)) {
      events.push({
        type: signalName,
        data: extractSignalData(output, signalName),
      });
    }
  }

  // Find all plan completions
  const planMatches = output.matchAll(/<plan>PLAN_(\d+)_COMPLETE<\/plan>/g);
  for (const match of planMatches) {
    events.push({
      type: 'PLAN_COMPLETE',
      data: { planNumber: parseInt(match[1], 10) },
    });
  }

  return events;
}
