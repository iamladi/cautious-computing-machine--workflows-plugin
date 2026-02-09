/**
 * Core types for the workflow runner
 */

export type WorkflowPhase =
  | 'idle'
  | 'setup'
  | 'planning'
  | 'implementing'
  | 'submitting'
  | 'ci_resolution'
  | 'ci_fixing'
  | 'comment_resolution'
  | 'comment_resolving'
  | 'completed'
  | 'failed';

export type WorkflowSignal =
  | 'SETUP_COMPLETE'
  | 'PLANNING_COMPLETE'
  | 'PLAN_COMPLETE'
  | 'IMPLEMENTATION_COMPLETE'
  | 'PR_CREATED'
  | 'CI_PASSED'
  | 'CI_FAILED'
  | 'CI_FIX_PUSHED'
  | 'COMMENTS_RESOLVED'
  | 'COMMENTS_PENDING'
  | 'COMMENT_FIX_PUSHED'
  | 'WORKFLOW_COMPLETE'
  | 'FAILED';

export interface WorkflowContext {
  researchFile: string;
  worktreePath: string | null;
  branch: string | null;
  plans: PlanInfo[];
  currentPlanIndex: number;
  prNumber: number | null;
  prUrl: string | null;
  ciAttempts: number;
  commentAttempts: number;
  error: string | null;
  startedAt: string;
  lastUpdate: string;
  signals: SignalRecord[];
}

export interface PlanInfo {
  path: string;
  issueNumber: number | null;
  completed: boolean;
}

export interface SignalRecord {
  signal: WorkflowSignal;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface WorkflowEvent {
  type: WorkflowSignal | 'START' | 'FAIL';
  researchFile?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export interface WorkflowResult {
  success: boolean;
  context: WorkflowContext;
  finalPhase: WorkflowPhase;
}

export interface ClaudeRunOptions {
  prompt: string;
  workingDirectory?: string;
  timeout?: number;
}

export interface ClaudeRunResult {
  content: string;
  exitCode: number;
}

export interface ProgressFileData {
  timestamp: string;
  researchFile: string;
  worktreePath: string | null;
  branch: string | null;
  currentPhase: WorkflowPhase;
  iteration: number;
  startedAt: string;
  lastUpdate: string;
  plans: {
    total: number;
    completed: number;
    list: PlanInfo[];
  };
  pr: {
    number: number | null;
    url: string | null;
    ciStatus: 'pending' | 'passing' | 'failing' | null;
    ciAttempts: number;
  };
  comments: {
    total: number;
    resolved: number;
    pending: number;
  };
  signals: SignalRecord[];
}
