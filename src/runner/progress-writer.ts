/**
 * Progress file reader/writer for workflow state persistence
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  WorkflowContext,
  WorkflowPhase,
  ProgressFileData,
  SignalRecord,
  PlanInfo,
} from '../types';

const PROGRESS_FILENAME = '.workflow-progress.txt';

export class ProgressWriter {
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
  }

  private get filePath(): string {
    return join(this.basePath, PROGRESS_FILENAME);
  }

  /**
   * Write current workflow state to progress file
   */
  async write(
    context: WorkflowContext,
    phase: WorkflowPhase,
    iteration: number
  ): Promise<void> {
    const now = new Date().toISOString();

    const plansCompleted = context.plans.filter((p) => p.completed).length;
    const plansList = context.plans
      .map((p, i) => {
        const marker = p.completed ? '[x]' : '[ ]';
        const current =
          !p.completed && i === context.currentPlanIndex ? ' <- CURRENT' : '';
        const issue = p.issueNumber ? ` (issue: #${p.issueNumber})` : '';
        return `- ${marker} ${p.path}${issue}${current}`;
      })
      .join('\n');

    const signalsList = context.signals
      .map((s) => `- ${s.timestamp}: ${s.signal}`)
      .join('\n');

    const content = `# Workflow Progress
# Generated: ${now}
# Research: ${context.researchFile}
# Worktree: ${context.worktreePath ?? 'not created'}
# Branch: ${context.branch ?? 'not created'}

## Status
current_phase: ${phase.toUpperCase()}
iteration: ${iteration}
started_at: ${context.startedAt}
last_update: ${now}

## Plans
total: ${context.plans.length}
completed: ${plansCompleted}
${plansList || '(no plans yet)'}

## PR
number: ${context.prNumber ?? 'null'}
url: ${context.prUrl ?? 'null'}
ci_status: ${getCiStatus(context, phase)}
ci_attempts: ${context.ciAttempts}

## Comments
total: 0
resolved: 0
pending: 0

## Signals
${signalsList || '(no signals yet)'}
`;

    await writeFile(this.filePath, content, 'utf-8');
  }

  /**
   * Read existing progress file and parse into context
   */
  async read(): Promise<ProgressFileData | null> {
    try {
      await access(this.filePath);
    } catch {
      return null;
    }

    const content = await readFile(this.filePath, 'utf-8');
    return this.parse(content);
  }

  /**
   * Check if progress file exists
   */
  async exists(): Promise<boolean> {
    try {
      await access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse progress file content into structured data
   */
  private parse(content: string): ProgressFileData {
    const lines = content.split('\n');

    // Parse header comments
    const researchFile = extractHeaderValue(lines, 'Research:') ?? '';
    const worktreePath = extractHeaderValue(lines, 'Worktree:');
    const branch = extractHeaderValue(lines, 'Branch:');

    // Parse status section
    const currentPhase = (
      extractValue(content, 'current_phase:') ?? 'idle'
    ).toLowerCase() as WorkflowPhase;
    const iteration = parseInt(extractValue(content, 'iteration:') ?? '0', 10);
    const startedAt = extractValue(content, 'started_at:') ?? '';
    const lastUpdate = extractValue(content, 'last_update:') ?? '';

    // Parse plans section
    const plansTotal = parseInt(extractValue(content, 'total:') ?? '0', 10);
    const plansCompleted = parseInt(
      extractValue(content, 'completed:') ?? '0',
      10
    );
    const plansList = parsePlansList(content);

    // Parse PR section
    const prNumber = parseNullableInt(extractValue(content, 'number:'));
    const prUrl = parseNullableString(extractValue(content, 'url:'));
    const ciStatus = parseNullableString(extractValue(content, 'ci_status:')) as
      | 'pending'
      | 'passing'
      | 'failing'
      | null;
    const ciAttempts = parseInt(
      extractValue(content, 'ci_attempts:') ?? '0',
      10
    );

    // Parse signals section
    const signals = parseSignalsList(content);

    return {
      timestamp: new Date().toISOString(),
      researchFile,
      worktreePath: worktreePath === 'not created' ? null : worktreePath,
      branch: branch === 'not created' ? null : branch,
      currentPhase,
      iteration,
      startedAt,
      lastUpdate,
      plans: {
        total: plansTotal,
        completed: plansCompleted,
        list: plansList,
      },
      pr: {
        number: prNumber,
        url: prUrl,
        ciStatus,
        ciAttempts,
      },
      comments: {
        total: 0,
        resolved: 0,
        pending: 0,
      },
      signals,
    };
  }
}

// Helper functions

function getCiStatus(
  context: WorkflowContext,
  phase: WorkflowPhase
): 'pending' | 'passing' | 'failing' | 'null' {
  if (!context.prNumber) return 'null';
  if (phase === 'completed') return 'passing';
  if (phase === 'ci_fixing') return 'failing';
  if (phase === 'ci_resolution') return 'pending';
  return 'pending';
}

function extractHeaderValue(lines: string[], prefix: string): string | null {
  for (const line of lines) {
    if (line.startsWith(`# ${prefix}`)) {
      return line.slice(`# ${prefix}`.length).trim();
    }
  }
  return null;
}

function extractValue(content: string, key: string): string | null {
  const regex = new RegExp(`^${key}\\s*(.+)$`, 'm');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function parseNullableInt(value: string | null): number | null {
  if (!value || value === 'null') return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

function parseNullableString(value: string | null): string | null {
  if (!value || value === 'null') return null;
  return value;
}

function parsePlansList(content: string): PlanInfo[] {
  const plans: PlanInfo[] = [];
  const planRegex = /^- \[(x| )\] (.+?)(?:\s*\(issue: #(\d+)\))?/gm;

  let match;
  while ((match = planRegex.exec(content)) !== null) {
    plans.push({
      path: match[2].replace(' <- CURRENT', '').trim(),
      issueNumber: match[3] ? parseInt(match[3], 10) : null,
      completed: match[1] === 'x',
    });
  }

  return plans;
}

function parseSignalsList(content: string): SignalRecord[] {
  const signals: SignalRecord[] = [];
  const signalSection = content.split('## Signals')[1];
  if (!signalSection) return signals;

  const signalRegex = /^- (.+): (\w+)/gm;
  let match;
  while ((match = signalRegex.exec(signalSection)) !== null) {
    signals.push({
      timestamp: match[1],
      signal: match[2] as SignalRecord['signal'],
    });
  }

  return signals;
}
