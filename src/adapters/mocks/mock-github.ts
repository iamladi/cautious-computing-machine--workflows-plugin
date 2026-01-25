/**
 * Mock GitHub Client - Test adapter for IGitHubClient
 *
 * Provides controllable responses for unit testing without
 * calling the real GitHub CLI.
 */

import type {
  IGitHubClient,
  CIRun,
  CIRunDetails,
  PRComment,
  PullRequest,
} from '../../ports/github.port';

export interface MockGitHubClientOptions {
  ciRuns?: CIRun[];
  ciRunDetails?: Map<number, CIRunDetails>;
  comments?: Map<number, PRComment[]>;
  pullRequests?: Map<number, PullRequest>;
  currentBranch?: string;
  jobLogs?: Map<number, string>;
}

export class MockGitHubClient implements IGitHubClient {
  private ciRuns: CIRun[];
  private ciRunDetails: Map<number, CIRunDetails>;
  private comments: Map<number, PRComment[]>;
  private pullRequests: Map<number, PullRequest>;
  private currentBranch: string;
  private jobLogs: Map<number, string>;
  private nextCommentId = 1;

  constructor(options: MockGitHubClientOptions = {}) {
    this.ciRuns = options.ciRuns ?? [];
    this.ciRunDetails = options.ciRunDetails ?? new Map();
    this.comments = options.comments ?? new Map();
    this.pullRequests = options.pullRequests ?? new Map();
    this.currentBranch = options.currentBranch ?? 'main';
    this.jobLogs = options.jobLogs ?? new Map();
  }

  async getCIStatus(runId: number): Promise<CIRunDetails> {
    const details = this.ciRunDetails.get(runId);
    if (!details) {
      throw new Error(`CI run ${runId} not found`);
    }
    return details;
  }

  async listCIRuns(branch?: string, limit?: number): Promise<CIRun[]> {
    let runs = this.ciRuns;
    if (branch) {
      runs = runs.filter((r) => r.headBranch === branch);
    }
    if (limit) {
      runs = runs.slice(0, limit);
    }
    return runs;
  }

  async *pollUntilComplete(
    runId: number,
    options?: { intervalMs?: number; timeoutMs?: number }
  ): AsyncGenerator<CIRunDetails, CIRunDetails, unknown> {
    const details = await this.getCIStatus(runId);
    yield details;
    return details;
  }

  async getComments(prNumber: number): Promise<PRComment[]> {
    return this.comments.get(prNumber) ?? [];
  }

  async postComment(prNumber: number, body: string): Promise<PRComment> {
    const comment: PRComment = {
      id: this.nextCommentId++,
      body,
      author: 'mock-bot',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const existing = this.comments.get(prNumber) ?? [];
    this.comments.set(prNumber, [...existing, comment]);
    return comment;
  }

  async replyToComment(prNumber: number, commentId: number, body: string): Promise<PRComment> {
    const reply: PRComment = {
      id: this.nextCommentId++,
      body,
      author: 'mock-bot',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      inReplyToId: commentId,
    };
    const existing = this.comments.get(prNumber) ?? [];
    this.comments.set(prNumber, [...existing, reply]);
    return reply;
  }

  async getPullRequest(prNumber: number): Promise<PullRequest> {
    const pr = this.pullRequests.get(prNumber);
    if (!pr) {
      throw new Error(`Pull request #${prNumber} not found`);
    }
    return pr;
  }

  async getCurrentBranch(): Promise<string> {
    return this.currentBranch;
  }

  async getJobLogs(jobId: number): Promise<string> {
    return this.jobLogs.get(jobId) ?? '';
  }

  // Test helpers
  setCIRuns(runs: CIRun[]): void {
    this.ciRuns = runs;
  }

  setCIRunDetails(runId: number, details: CIRunDetails): void {
    this.ciRunDetails.set(runId, details);
  }

  setComments(prNumber: number, comments: PRComment[]): void {
    this.comments.set(prNumber, comments);
  }

  setPullRequest(prNumber: number, pr: PullRequest): void {
    this.pullRequests.set(prNumber, pr);
  }

  setCurrentBranch(branch: string): void {
    this.currentBranch = branch;
  }

  setJobLogs(jobId: number, logs: string): void {
    this.jobLogs.set(jobId, logs);
  }
}
