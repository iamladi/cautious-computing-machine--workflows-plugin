/**
 * Unit tests for phase-mapper.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  mapPhaseToCommand,
  formatCommand,
  getPhaseName,
  isTerminalPhase,
  isSuccessPhase,
} from './phase-mapper';
import type { WorkflowContext } from '../types';

describe('mapPhaseToCommand', () => {
  const createContext = (overrides: Partial<WorkflowContext> = {}): WorkflowContext => ({
    researchFile: 'research/test.md',
    worktreePath: '/path/to/worktree',
    branch: 'feat/test',
    plans: [],
    currentPlanIndex: 0,
    prNumber: null,
    prUrl: null,
    ciAttempts: 0,
    commentAttempts: 0,
    error: null,
    startedAt: '2024-01-01T00:00:00.000Z',
    lastUpdate: '2024-01-01T00:00:00.000Z',
    signals: [],
    ...overrides,
  });

  test('maps setup phase to phase-setup command', () => {
    const context = createContext();
    const result = mapPhaseToCommand('setup', context);
    expect(result).toEqual({
      command: '/workflows:phase-setup',
      args: ['research/test.md'],
    });
  });

  test('maps planning phase to phase-plan command', () => {
    const context = createContext();
    const result = mapPhaseToCommand('planning', context);
    expect(result).toEqual({
      command: '/workflows:phase-plan',
      args: ['research/test.md'],
    });
  });

  test('maps implementing phase to phase-impl command with current plan', () => {
    const context = createContext({
      plans: [
        { path: 'plans/workflow-1.md', issueNumber: 42, completed: false },
        { path: 'plans/workflow-2.md', issueNumber: 43, completed: false },
      ],
      currentPlanIndex: 0,
    });
    const result = mapPhaseToCommand('implementing', context);
    expect(result).toEqual({
      command: '/workflows:phase-impl',
      args: ['plans/workflow-1.md'],
    });
  });

  test('maps implementing phase with second plan', () => {
    const context = createContext({
      plans: [
        { path: 'plans/workflow-1.md', issueNumber: 42, completed: true },
        { path: 'plans/workflow-2.md', issueNumber: 43, completed: false },
      ],
      currentPlanIndex: 1,
    });
    const result = mapPhaseToCommand('implementing', context);
    expect(result).toEqual({
      command: '/workflows:phase-impl',
      args: ['plans/workflow-2.md'],
    });
  });

  test('returns null for implementing with no plans', () => {
    const context = createContext({ plans: [], currentPlanIndex: 0 });
    const result = mapPhaseToCommand('implementing', context);
    expect(result).toBeNull();
  });

  test('maps submitting phase to phase-submit command', () => {
    const context = createContext();
    const result = mapPhaseToCommand('submitting', context);
    expect(result).toEqual({
      command: '/workflows:phase-submit',
      args: [],
    });
  });

  test('maps ci_resolution phase to phase-verify-ci command', () => {
    const context = createContext({ prNumber: 123 });
    const result = mapPhaseToCommand('ci_resolution', context);
    expect(result).toEqual({
      command: '/workflows:phase-verify-ci',
      args: ['123'],
    });
  });

  test('maps ci_fixing phase to phase-fix-ci command', () => {
    const context = createContext({ prNumber: 456 });
    const result = mapPhaseToCommand('ci_fixing', context);
    expect(result).toEqual({
      command: '/workflows:phase-fix-ci',
      args: ['456'],
    });
  });

  test('maps comment_resolution phase to phase-resolve-comments command', () => {
    const context = createContext({ prNumber: 789 });
    const result = mapPhaseToCommand('comment_resolution', context);
    expect(result).toEqual({
      command: '/workflows:phase-resolve-comments',
      args: ['789'],
    });
  });

  test('returns null for idle phase', () => {
    const context = createContext();
    const result = mapPhaseToCommand('idle', context);
    expect(result).toBeNull();
  });

  test('returns null for completed phase', () => {
    const context = createContext();
    const result = mapPhaseToCommand('completed', context);
    expect(result).toBeNull();
  });

  test('returns null for failed phase', () => {
    const context = createContext();
    const result = mapPhaseToCommand('failed', context);
    expect(result).toBeNull();
  });
});

describe('formatCommand', () => {
  test('formats command with no args', () => {
    const result = formatCommand({ command: '/workflows:phase-submit', args: [] });
    expect(result).toBe('/workflows:phase-submit');
  });

  test('formats command with single arg', () => {
    const result = formatCommand({
      command: '/workflows:phase-setup',
      args: ['research/test.md'],
    });
    expect(result).toBe('/workflows:phase-setup research/test.md');
  });

  test('formats command with multiple args', () => {
    const result = formatCommand({
      command: '/some:command',
      args: ['arg1', 'arg2', 'arg3'],
    });
    expect(result).toBe('/some:command arg1 arg2 arg3');
  });
});

describe('getPhaseName', () => {
  test('returns human-readable names', () => {
    expect(getPhaseName('idle')).toBe('Idle');
    expect(getPhaseName('setup')).toBe('Setup');
    expect(getPhaseName('planning')).toBe('Planning');
    expect(getPhaseName('implementing')).toBe('Implementing');
    expect(getPhaseName('submitting')).toBe('Submitting PR');
    expect(getPhaseName('ci_resolution')).toBe('Verifying CI');
    expect(getPhaseName('ci_fixing')).toBe('Fixing CI');
    expect(getPhaseName('comment_resolution')).toBe('Resolving Comments');
    expect(getPhaseName('completed')).toBe('Completed');
    expect(getPhaseName('failed')).toBe('Failed');
  });
});

describe('isTerminalPhase', () => {
  test('returns true for completed', () => {
    expect(isTerminalPhase('completed')).toBe(true);
  });

  test('returns true for failed', () => {
    expect(isTerminalPhase('failed')).toBe(true);
  });

  test('returns false for other phases', () => {
    expect(isTerminalPhase('idle')).toBe(false);
    expect(isTerminalPhase('setup')).toBe(false);
    expect(isTerminalPhase('implementing')).toBe(false);
    expect(isTerminalPhase('ci_resolution')).toBe(false);
  });
});

describe('isSuccessPhase', () => {
  test('returns true for completed', () => {
    expect(isSuccessPhase('completed')).toBe(true);
  });

  test('returns false for failed', () => {
    expect(isSuccessPhase('failed')).toBe(false);
  });

  test('returns false for other phases', () => {
    expect(isSuccessPhase('idle')).toBe(false);
    expect(isSuccessPhase('implementing')).toBe(false);
  });
});
