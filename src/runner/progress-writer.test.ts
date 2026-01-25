/**
 * Unit tests for progress-writer.ts
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ProgressWriter } from './progress-writer';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WorkflowContext, WorkflowPhase } from '../types';

describe('ProgressWriter', () => {
  let testDir: string;
  let writer: ProgressWriter;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'workflow-test-'));
    writer = new ProgressWriter(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

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

  test('writes progress file', async () => {
    const context = createContext();
    await writer.write(context, 'setup', 1);

    const content = await readFile(join(testDir, '.workflow-progress.txt'), 'utf-8');
    expect(content).toContain('# Workflow Progress');
    expect(content).toContain('Research: research/test.md');
    expect(content).toContain('Worktree: /path/to/worktree');
    expect(content).toContain('current_phase: SETUP');
    expect(content).toContain('iteration: 1');
  });

  test('writes plans list correctly', async () => {
    const context = createContext({
      plans: [
        { path: 'plans/workflow-1.md', issueNumber: 42, completed: true },
        { path: 'plans/workflow-2.md', issueNumber: 43, completed: false },
      ],
      currentPlanIndex: 1,
    });

    await writer.write(context, 'implementing', 2);

    const content = await readFile(join(testDir, '.workflow-progress.txt'), 'utf-8');
    expect(content).toContain('total: 2');
    expect(content).toContain('completed: 1');
    expect(content).toContain('[x] plans/workflow-1.md (issue: #42)');
    expect(content).toContain('[ ] plans/workflow-2.md (issue: #43) <- CURRENT');
  });

  test('writes signals list', async () => {
    const context = createContext({
      signals: [
        { signal: 'SETUP_COMPLETE', timestamp: '2024-01-01T00:01:00.000Z' },
        { signal: 'PLANNING_COMPLETE', timestamp: '2024-01-01T00:02:00.000Z' },
      ],
    });

    await writer.write(context, 'implementing', 3);

    const content = await readFile(join(testDir, '.workflow-progress.txt'), 'utf-8');
    expect(content).toContain('SETUP_COMPLETE');
    expect(content).toContain('PLANNING_COMPLETE');
  });

  test('writes PR info when present', async () => {
    const context = createContext({
      prNumber: 123,
      prUrl: 'https://github.com/org/repo/pull/123',
      ciAttempts: 2,
    });

    await writer.write(context, 'ci_resolution', 5);

    const content = await readFile(join(testDir, '.workflow-progress.txt'), 'utf-8');
    expect(content).toContain('number: 123');
    expect(content).toContain('url: https://github.com/org/repo/pull/123');
    expect(content).toContain('ci_attempts: 2');
  });

  test('exists returns false when file does not exist', async () => {
    const exists = await writer.exists();
    expect(exists).toBe(false);
  });

  test('exists returns true when file exists', async () => {
    const context = createContext();
    await writer.write(context, 'setup', 1);

    const exists = await writer.exists();
    expect(exists).toBe(true);
  });

  test('read returns null when file does not exist', async () => {
    const data = await writer.read();
    expect(data).toBeNull();
  });

  test('read parses written progress file', async () => {
    const context = createContext({
      plans: [
        { path: 'plans/workflow-1.md', issueNumber: 42, completed: true },
        { path: 'plans/workflow-2.md', issueNumber: 43, completed: false },
      ],
      prNumber: 123,
      prUrl: 'https://github.com/org/repo/pull/123',
    });

    await writer.write(context, 'ci_resolution', 5);
    const data = await writer.read();

    expect(data).not.toBeNull();
    expect(data!.researchFile).toBe('research/test.md');
    expect(data!.worktreePath).toBe('/path/to/worktree');
    expect(data!.branch).toBe('feat/test');
    expect(data!.currentPhase).toBe('ci_resolution');
    expect(data!.iteration).toBe(5);
    expect(data!.plans.total).toBe(2);
    expect(data!.plans.completed).toBe(1);
    expect(data!.plans.list).toHaveLength(2);
    expect(data!.pr.number).toBe(123);
    expect(data!.pr.url).toBe('https://github.com/org/repo/pull/123');
  });

  test('handles null worktree path', async () => {
    const context = createContext({
      worktreePath: null,
      branch: null,
    });

    await writer.write(context, 'idle', 0);
    const data = await writer.read();

    expect(data).not.toBeNull();
    expect(data!.worktreePath).toBeNull();
    expect(data!.branch).toBeNull();
  });
});
