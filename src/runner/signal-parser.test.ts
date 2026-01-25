/**
 * Unit tests for signal-parser.ts
 */

import { describe, test, expect } from 'bun:test';
import { parseSignals, parseAllSignals, extractSignalData } from './signal-parser';

describe('parseSignals', () => {
  test('parses SETUP_COMPLETE signal', () => {
    const output = 'Setup done.\n<phase>SETUP_COMPLETE</phase>\nworktree_path: /path/to/worktree';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'SETUP_COMPLETE' });
  });

  test('parses PLANNING_COMPLETE signal', () => {
    const output = '<phase>PLANNING_COMPLETE</phase>';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'PLANNING_COMPLETE' });
  });

  test('parses CI_PASSED signal', () => {
    const output = 'All checks passed.\n<phase>CI_PASSED</phase>';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'CI_PASSED' });
  });

  test('parses CI_FAILED signal', () => {
    const output = '<phase>CI_FAILED</phase>\nci_failure_reason: test failed';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'CI_FAILED' });
  });

  test('parses PLAN_N_COMPLETE signal', () => {
    const output = 'Plan done.\n<plan>PLAN_1_COMPLETE</plan>';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'PLAN_COMPLETE', data: { planNumber: 1 } });
  });

  test('parses plan with double-digit number', () => {
    const output = '<plan>PLAN_12_COMPLETE</plan>';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'PLAN_COMPLETE', data: { planNumber: 12 } });
  });

  test('parses promise FAILED signal', () => {
    const output = '<promise>FAILED</promise>\n<error>Something went wrong</error>';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'FAIL', error: 'Something went wrong' });
  });

  test('parses promise FAILED with unknown error', () => {
    const output = '<promise>FAILED</promise>';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'FAIL', error: 'Unknown error' });
  });

  test('parses promise COMPLETE signal', () => {
    const output = '<promise>COMPLETE</promise>';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'WORKFLOW_COMPLETE' });
  });

  test('returns null for no signal', () => {
    const output = 'Just some regular output with no signals';
    const event = parseSignals(output);
    expect(event).toBeNull();
  });

  test('returns null for empty output', () => {
    const event = parseSignals('');
    expect(event).toBeNull();
  });

  test('prefers phase signal over plan signal when both present', () => {
    const output = '<phase>CI_PASSED</phase>\n<plan>PLAN_1_COMPLETE</plan>';
    const event = parseSignals(output);
    expect(event).toEqual({ type: 'CI_PASSED' });
  });
});

describe('parseAllSignals', () => {
  test('parses multiple phase signals', () => {
    const output = '<phase>SETUP_COMPLETE</phase>\n<phase>PLANNING_COMPLETE</phase>';
    const events = parseAllSignals(output);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('SETUP_COMPLETE');
    expect(events[1].type).toBe('PLANNING_COMPLETE');
  });

  test('parses mixed signals', () => {
    const output = '<phase>IMPLEMENTATION_COMPLETE</phase>\n<plan>PLAN_1_COMPLETE</plan>\n<plan>PLAN_2_COMPLETE</plan>';
    const events = parseAllSignals(output);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('IMPLEMENTATION_COMPLETE');
    expect(events[1].type).toBe('PLAN_COMPLETE');
    expect(events[2].type).toBe('PLAN_COMPLETE');
  });

  test('returns empty array for no signals', () => {
    const events = parseAllSignals('no signals here');
    expect(events).toEqual([]);
  });
});

describe('extractSignalData', () => {
  test('extracts worktree path and branch from SETUP_COMPLETE', () => {
    const output = 'worktree_path: /path/to/worktree\nbranch: feat/my-feature';
    const data = extractSignalData(output, 'SETUP_COMPLETE');
    expect(data).toEqual({
      worktreePath: '/path/to/worktree',
      branch: 'feat/my-feature',
    });
  });

  test('extracts plans count from PLANNING_COMPLETE', () => {
    const output = 'plans_count: 5';
    const data = extractSignalData(output, 'PLANNING_COMPLETE');
    expect(data).toEqual({ plansCount: 5 });
  });

  test('extracts PR info from PR_CREATED', () => {
    const output = 'pr_url: https://github.com/org/repo/pull/123\npr_number: 123';
    const data = extractSignalData(output, 'PR_CREATED');
    expect(data).toEqual({
      prUrl: 'https://github.com/org/repo/pull/123',
      prNumber: 123,
    });
  });

  test('extracts failure reason from CI_FAILED', () => {
    const output = 'ci_failure_reason: tests failed';
    const data = extractSignalData(output, 'CI_FAILED');
    expect(data).toEqual({ failureReason: 'tests failed' });
  });

  test('returns empty object for unknown signal', () => {
    const output = 'some output';
    const data = extractSignalData(output, 'COMMENTS_RESOLVED');
    expect(data).toEqual({});
  });
});
