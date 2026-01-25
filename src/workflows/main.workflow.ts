/**
 * Main Workflow - XState state machine for phase orchestration
 *
 * Orchestrates the full SDLC workflow:
 * Setup → Planning → Implementing → Verifying → Completed/Failed
 */

import { createMachine, assign, fromPromise, type AnyActorRef } from 'xstate';
import type { IGitHubClient, IClaudeClient } from '../ports';

// Context types
export interface WorkflowContext {
  researchFile: string;
  worktreePath: string | null;
  branch: string | null;
  planFiles: string[];
  completedPlans: string[];
  currentPlanIndex: number;
  prNumber: number | null;
  prUrl: string | null;
  ciRunId: number | null;
  ciAttempts: number;
  maxCIAttempts: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// Event types
export type WorkflowEvent =
  | { type: 'START'; researchFile: string }
  | { type: 'SETUP_COMPLETE'; worktreePath: string; branch: string }
  | { type: 'PLANNING_COMPLETE'; planFiles: string[] }
  | { type: 'PLAN_COMPLETE' }
  | { type: 'ALL_PLANS_COMPLETE' }
  | { type: 'PR_CREATED'; prNumber: number; prUrl: string; ciRunId: number }
  | { type: 'CI_PASSED' }
  | { type: 'CI_FAILED'; error: string }
  | { type: 'RETRY' }
  | { type: 'FAIL'; error: string };

// Initial context factory
export function createInitialContext(): WorkflowContext {
  return {
    researchFile: '',
    worktreePath: null,
    branch: null,
    planFiles: [],
    completedPlans: [],
    currentPlanIndex: 0,
    prNumber: null,
    prUrl: null,
    ciRunId: null,
    ciAttempts: 0,
    maxCIAttempts: 3,
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

// The main workflow machine
export const workflowMachine = createMachine(
  {
    id: 'workflow',
    initial: 'idle',
    context: createInitialContext,
    types: {
      context: {} as WorkflowContext,
      events: {} as WorkflowEvent,
    },
    states: {
      idle: {
        on: {
          START: {
            target: 'setup',
            actions: assign({
              researchFile: ({ event }) => event.researchFile,
              startedAt: () => new Date().toISOString(),
            }),
          },
        },
      },
      setup: {
        description: 'Creating worktree and initializing workspace',
        on: {
          SETUP_COMPLETE: {
            target: 'planning',
            actions: assign({
              worktreePath: ({ event }) => event.worktreePath,
              branch: ({ event }) => event.branch,
            }),
          },
          FAIL: {
            target: 'failed',
            actions: assign({ error: ({ event }) => event.error }),
          },
        },
      },
      planning: {
        description: 'Generating implementation plans from research',
        on: {
          PLANNING_COMPLETE: {
            target: 'implementing',
            actions: assign({
              planFiles: ({ event }) => event.planFiles,
              currentPlanIndex: 0,
              completedPlans: [],
            }),
          },
          FAIL: {
            target: 'failed',
            actions: assign({ error: ({ event }) => event.error }),
          },
        },
      },
      implementing: {
        description: 'Executing implementation plans',
        on: {
          PLAN_COMPLETE: [
            {
              guard: 'hasMorePlans',
              actions: assign({
                completedPlans: ({ context }) => [
                  ...context.completedPlans,
                  context.planFiles[context.currentPlanIndex]!,
                ],
                currentPlanIndex: ({ context }) => context.currentPlanIndex + 1,
              }),
            },
            {
              target: 'submitting',
              actions: assign({
                completedPlans: ({ context }) => [
                  ...context.completedPlans,
                  context.planFiles[context.currentPlanIndex]!,
                ],
              }),
            },
          ],
          ALL_PLANS_COMPLETE: {
            target: 'submitting',
          },
          FAIL: {
            target: 'failed',
            actions: assign({ error: ({ event }) => event.error }),
          },
        },
      },
      submitting: {
        description: 'Creating PR and pushing changes',
        on: {
          PR_CREATED: {
            target: 'verifying',
            actions: assign({
              prNumber: ({ event }) => event.prNumber,
              prUrl: ({ event }) => event.prUrl,
              ciRunId: ({ event }) => event.ciRunId,
              ciAttempts: 1,
            }),
          },
          FAIL: {
            target: 'failed',
            actions: assign({ error: ({ event }) => event.error }),
          },
        },
      },
      verifying: {
        description: 'Waiting for CI to pass',
        on: {
          CI_PASSED: {
            target: 'completed',
            actions: assign({
              completedAt: () => new Date().toISOString(),
            }),
          },
          CI_FAILED: [
            {
              guard: 'canRetry',
              target: 'fixing',
              actions: assign({
                error: ({ event }) => event.error,
                ciAttempts: ({ context }) => context.ciAttempts + 1,
              }),
            },
            {
              target: 'failed',
              actions: assign({ error: ({ event }) => event.error }),
            },
          ],
          FAIL: {
            target: 'failed',
            actions: assign({ error: ({ event }) => event.error }),
          },
        },
      },
      fixing: {
        description: 'Fixing CI failures',
        on: {
          PR_CREATED: {
            target: 'verifying',
            actions: assign({
              ciRunId: ({ event }) => event.ciRunId,
            }),
          },
          FAIL: {
            target: 'failed',
            actions: assign({ error: ({ event }) => event.error }),
          },
        },
      },
      completed: {
        type: 'final',
        description: 'Workflow completed successfully',
      },
      failed: {
        type: 'final',
        description: 'Workflow encountered an error',
      },
    },
  },
  {
    guards: {
      hasMorePlans: ({ context }) => {
        return context.currentPlanIndex + 1 < context.planFiles.length;
      },
      canRetry: ({ context }) => {
        return context.ciAttempts < context.maxCIAttempts;
      },
    },
  }
);

// Helper functions for workflow state inspection

export function getCurrentPhase(
  state: ReturnType<typeof workflowMachine.getInitialSnapshot>
): string {
  return state.value as string;
}

export function getProgress(context: WorkflowContext): {
  totalPlans: number;
  completedPlans: number;
  percentComplete: number;
} {
  const totalPlans = context.planFiles.length;
  const completedPlans = context.completedPlans.length;
  const percentComplete = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;

  return { totalPlans, completedPlans, percentComplete };
}

export function getCurrentPlan(context: WorkflowContext): string | null {
  return context.planFiles[context.currentPlanIndex] ?? null;
}

export function isTerminal(
  state: ReturnType<typeof workflowMachine.getInitialSnapshot>
): boolean {
  return state.status === 'done';
}

export function isSuccess(
  state: ReturnType<typeof workflowMachine.getInitialSnapshot>
): boolean {
  return state.value === 'completed';
}

export function isFailure(
  state: ReturnType<typeof workflowMachine.getInitialSnapshot>
): boolean {
  return state.value === 'failed';
}

// Type exports for external use
export type WorkflowMachine = typeof workflowMachine;
export type WorkflowSnapshot = ReturnType<typeof workflowMachine.getInitialSnapshot>;
