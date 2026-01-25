/**
 * GitHub CLI Adapter - Real implementation using `gh` CLI
 *
 * Implements IGitHubClient interface using GitHub CLI for all operations.
 * Supports streaming JSON output for efficient large result handling.
 */

import { execa, type Options as ExecaOptions } from 'execa';
import type {
  IGitHubClient,
  CIRun,
  CIRunDetails,
  CIJob,
  PRComment,
  PullRequest,
  CIStatus,
  CIConclusion,
} from '../ports/github.port';

export interface GitHubCLIAdapterOptions {
  cwd?: string;
  timeout?: number;
}

interface GHRunListItem {
  databaseId: number;
  displayTitle: string;
  status: string;
  conclusion: string | null;
  headSha: string;
  headBranch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface GHRunDetails extends GHRunListItem {
  jobs: GHJob[];
}

interface GHJob {
  databaseId: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps: GHStep[];
}

interface GHStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

interface GHComment {
  id: number;
  body: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  path?: string;
  line?: number;
  side?: string;
  replyTo?: { id: number };
}

interface GHPullRequest {
  number: number;
  title: string;
  body: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  url: string;
}

function mapStatus(status: string): CIStatus {
  const statusMap: Record<string, CIStatus> = {
    queued: 'queued',
    in_progress: 'in_progress',
    completed: 'completed',
    action_required: 'action_required',
    cancelled: 'cancelled',
    failure: 'failure',
    neutral: 'neutral',
    skipped: 'skipped',
    stale: 'stale',
    success: 'success',
    timed_out: 'timed_out',
  };
  return statusMap[status] ?? 'queued';
}

function mapConclusion(conclusion: string | null): CIConclusion {
  if (!conclusion) return null;
  const conclusionMap: Record<string, CIConclusion> = {
    success: 'success',
    failure: 'failure',
    neutral: 'neutral',
    cancelled: 'cancelled',
    skipped: 'skipped',
    timed_out: 'timed_out',
    action_required: 'action_required',
  };
  return conclusionMap[conclusion] ?? null;
}

function mapRun(run: GHRunListItem): CIRun {
  return {
    id: run.databaseId,
    name: run.displayTitle,
    status: mapStatus(run.status),
    conclusion: mapConclusion(run.conclusion),
    headSha: run.headSha,
    headBranch: run.headBranch,
    event: run.event,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    url: run.url,
  };
}

function mapJob(job: GHJob): CIJob {
  return {
    id: job.databaseId,
    name: job.name,
    status: mapStatus(job.status),
    conclusion: mapConclusion(job.conclusion),
    steps: job.steps.map((step) => ({
      name: step.name,
      status: mapStatus(step.status),
      conclusion: mapConclusion(step.conclusion),
      number: step.number,
    })),
  };
}

function mapRunDetails(run: GHRunDetails): CIRunDetails {
  return {
    ...mapRun(run),
    jobs: run.jobs?.map(mapJob) ?? [],
  };
}

function mapComment(comment: GHComment): PRComment {
  return {
    id: comment.id,
    body: comment.body,
    author: comment.author.login,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    path: comment.path,
    line: comment.line,
    side: comment.side as 'LEFT' | 'RIGHT' | undefined,
    inReplyToId: comment.replyTo?.id,
  };
}

function mapPullRequest(pr: GHPullRequest): PullRequest {
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state as 'open' | 'closed' | 'merged',
    headRef: pr.headRefName,
    baseRef: pr.baseRefName,
    url: pr.url,
  };
}

export class GitHubCLIAdapter implements IGitHubClient {
  private cwd: string;
  private timeout: number;

  constructor(options: GitHubCLIAdapterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.timeout = options.timeout ?? 30000;
  }

  private async gh<T>(args: string[]): Promise<T> {
    const options: ExecaOptions = {
      cwd: this.cwd,
      timeout: this.timeout,
    };

    const result = await execa('gh', args, options);
    return JSON.parse(result.stdout) as T;
  }

  async getCIStatus(runId: number): Promise<CIRunDetails> {
    const run = await this.gh<GHRunDetails>([
      'run',
      'view',
      runId.toString(),
      '--json',
      'databaseId,displayTitle,status,conclusion,headSha,headBranch,event,createdAt,updatedAt,url,jobs',
    ]);
    return mapRunDetails(run);
  }

  async listCIRuns(branch?: string, limit = 10): Promise<CIRun[]> {
    const args = [
      'run',
      'list',
      '--json',
      'databaseId,displayTitle,status,conclusion,headSha,headBranch,event,createdAt,updatedAt,url',
      '--limit',
      limit.toString(),
    ];

    if (branch) {
      args.push('--branch', branch);
    }

    const runs = await this.gh<GHRunListItem[]>(args);
    return runs.map(mapRun);
  }

  async *pollUntilComplete(
    runId: number,
    options?: { intervalMs?: number; timeoutMs?: number }
  ): AsyncGenerator<CIRunDetails, CIRunDetails, unknown> {
    const intervalMs = options?.intervalMs ?? 30000;
    const timeoutMs = options?.timeoutMs ?? 1800000; // 30 minutes default

    const startTime = Date.now();

    while (true) {
      const status = await this.getCIStatus(runId);
      yield status;

      if (status.status === 'completed') {
        return status;
      }

      if (Date.now() - startTime > timeoutMs) {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async getComments(prNumber: number): Promise<PRComment[]> {
    const comments = await this.gh<GHComment[]>([
      'pr',
      'view',
      prNumber.toString(),
      '--json',
      'comments',
      '--jq',
      '.comments',
    ]);
    return comments.map(mapComment);
  }

  async postComment(prNumber: number, body: string): Promise<PRComment> {
    await execa(
      'gh',
      ['pr', 'comment', prNumber.toString(), '--body', body],
      { cwd: this.cwd, timeout: this.timeout }
    );

    // gh doesn't return the created comment, fetch latest
    const comments = await this.getComments(prNumber);
    const latest = comments[comments.length - 1];
    if (!latest) {
      throw new Error('Failed to retrieve posted comment');
    }
    return latest;
  }

  async replyToComment(prNumber: number, commentId: number, body: string): Promise<PRComment> {
    // gh CLI doesn't directly support reply-to, use API
    const result = await execa(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/pulls/${prNumber}/comments/${commentId}/replies`,
        '-f',
        `body=${body}`,
      ],
      { cwd: this.cwd, timeout: this.timeout }
    );

    const reply = JSON.parse(result.stdout) as GHComment;
    return mapComment(reply);
  }

  async getPullRequest(prNumber: number): Promise<PullRequest> {
    const pr = await this.gh<GHPullRequest>([
      'pr',
      'view',
      prNumber.toString(),
      '--json',
      'number,title,body,state,headRefName,baseRefName,url',
    ]);
    return mapPullRequest(pr);
  }

  async getCurrentBranch(): Promise<string> {
    const result = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: this.cwd,
      timeout: this.timeout,
    });
    return result.stdout.trim();
  }

  async getJobLogs(jobId: number): Promise<string> {
    const result = await execa(
      'gh',
      ['run', 'view', '--job', jobId.toString(), '--log'],
      { cwd: this.cwd, timeout: this.timeout }
    );
    return result.stdout;
  }
}
