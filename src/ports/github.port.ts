/**
 * GitHub Port - Interface for GitHub CLI interactions
 *
 * Following Hexagonal Architecture, this port defines the contract
 * for GitHub operations without specifying implementation details.
 */

export type CIStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'action_required'
  | 'cancelled'
  | 'failure'
  | 'neutral'
  | 'skipped'
  | 'stale'
  | 'success'
  | 'timed_out';

export type CIConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | null;

export interface CIRun {
  id: number;
  name: string;
  status: CIStatus;
  conclusion: CIConclusion;
  headSha: string;
  headBranch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface CIRunDetails extends CIRun {
  jobs: CIJob[];
}

export interface CIJob {
  id: number;
  name: string;
  status: CIStatus;
  conclusion: CIConclusion;
  steps: CIStep[];
}

export interface CIStep {
  name: string;
  status: CIStatus;
  conclusion: CIConclusion;
  number: number;
}

export interface PRComment {
  id: number;
  body: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  path?: string;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  inReplyToId?: number;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  headRef: string;
  baseRef: string;
  url: string;
}

export interface IGitHubClient {
  /**
   * Get the status of a CI run
   */
  getCIStatus(runId: number): Promise<CIRunDetails>;

  /**
   * List recent CI runs for the current branch
   */
  listCIRuns(branch?: string, limit?: number): Promise<CIRun[]>;

  /**
   * Poll CI status until completion or timeout
   */
  pollUntilComplete(
    runId: number,
    options?: { intervalMs?: number; timeoutMs?: number }
  ): AsyncGenerator<CIRunDetails, CIRunDetails, unknown>;

  /**
   * Get comments on a pull request
   */
  getComments(prNumber: number): Promise<PRComment[]>;

  /**
   * Post a comment on a pull request
   */
  postComment(prNumber: number, body: string): Promise<PRComment>;

  /**
   * Reply to a specific comment
   */
  replyToComment(prNumber: number, commentId: number, body: string): Promise<PRComment>;

  /**
   * Get pull request details
   */
  getPullRequest(prNumber: number): Promise<PullRequest>;

  /**
   * Get the current branch name
   */
  getCurrentBranch(): Promise<string>;

  /**
   * Get CI logs for a specific job
   */
  getJobLogs(jobId: number): Promise<string>;
}
