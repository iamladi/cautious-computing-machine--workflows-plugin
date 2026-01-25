/**
 * XState workflow machine for the full SDLC pipeline
 *
 * States: idle → setup → planning → implementing → submitting →
 *         ci_resolution ↔ ci_fixing → comment_resolution ↔ comment_resolving → completed
 */

import { createMachine, assign } from 'xstate';
import type { WorkflowContext, WorkflowEvent, WorkflowPhase } from '../types';

// Retry limits
const MAX_CI_ATTEMPTS = 5;
const MAX_COMMENT_ATTEMPTS = 10;

// Initial context
const initialContext: WorkflowContext = {
  researchFile: '',
  worktreePath: null,
  branch: null,
  plans: [],
  currentPlanIndex: 0,
  prNumber: null,
  prUrl: null,
  ciAttempts: 0,
  commentAttempts: 0,
  error: null,
  startedAt: new Date().toISOString(),
  lastUpdate: new Date().toISOString(),
  signals: [],
};

// Helper to add signal to context
function addSignal(
  context: WorkflowContext,
  signal: string
): WorkflowContext['signals'] {
  // Only add valid workflow signals, skip internal events like 'START'
  if (signal === 'START') {
    return context.signals;
  }
  return [
    ...context.signals,
    {
      signal: signal as WorkflowContext['signals'][0]['signal'],
      timestamp: new Date().toISOString(),
    },
  ];
}

export const workflowMachine = createMachine({
  id: 'workflow',
  initial: 'idle',
  context: initialContext,

  states: {
    idle: {
      on: {
        START: {
          target: 'setup',
          actions: assign({
            researchFile: ({ event }) => event.researchFile ?? '',
            startedAt: () => new Date().toISOString(),
            lastUpdate: () => new Date().toISOString(),
            signals: () => [],
          }),
        },
      },
    },

    setup: {
      on: {
        SETUP_COMPLETE: {
          target: 'planning',
          actions: assign({
            worktreePath: ({ event }) =>
              (event.data?.worktreePath as string) ?? null,
            branch: ({ event }) => (event.data?.branch as string) ?? null,
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        FAIL: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error ?? 'Setup failed',
            signals: ({ context, event }) => addSignal(context, event.type),
          }),
        },
      },
    },

    planning: {
      on: {
        PLANNING_COMPLETE: {
          target: 'implementing',
          actions: assign({
            plans: ({ event }) => {
              const count = (event.data?.plansCount as number) ?? 0;
              // Plans will be populated by the phase command
              return Array.from({ length: count }, (_, i) => ({
                path: `plans/workflow-${i + 1}.md`,
                issueNumber: null,
                completed: false,
              }));
            },
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        FAIL: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error ?? 'Planning failed',
            signals: ({ context, event }) => addSignal(context, event.type),
          }),
        },
      },
    },

    implementing: {
      on: {
        PLAN_COMPLETE: {
          target: 'implementing',
          actions: assign({
            plans: ({ context }) =>
              context.plans.map((p, i) =>
                i === context.currentPlanIndex ? { ...p, completed: true } : p
              ),
            currentPlanIndex: ({ context }) => context.currentPlanIndex + 1,
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        IMPLEMENTATION_COMPLETE: {
          target: 'submitting',
          actions: assign({
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        FAIL: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error ?? 'Implementation failed',
            signals: ({ context, event }) => addSignal(context, event.type),
          }),
        },
      },
    },

    submitting: {
      on: {
        PR_CREATED: {
          target: 'ci_resolution',
          actions: assign({
            prNumber: ({ event }) => (event.data?.prNumber as number) ?? null,
            prUrl: ({ event }) => (event.data?.prUrl as string) ?? null,
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        FAIL: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error ?? 'PR submission failed',
            signals: ({ context, event }) => addSignal(context, event.type),
          }),
        },
      },
    },

    ci_resolution: {
      on: {
        CI_PASSED: {
          target: 'comment_resolution',
          actions: assign({
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        CI_FAILED: [
          {
            guard: ({ context }) => context.ciAttempts < MAX_CI_ATTEMPTS,
            target: 'ci_fixing',
            actions: assign({
              ciAttempts: ({ context }) => context.ciAttempts + 1,
              signals: ({ context, event }) => addSignal(context, event.type),
              lastUpdate: () => new Date().toISOString(),
            }),
          },
          {
            target: 'failed',
            actions: assign({
              error: () => `CI failed after ${MAX_CI_ATTEMPTS} attempts`,
              signals: ({ context, event }) => addSignal(context, event.type),
            }),
          },
        ],
        FAIL: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error ?? 'CI resolution failed',
            signals: ({ context, event }) => addSignal(context, event.type),
          }),
        },
      },
    },

    ci_fixing: {
      on: {
        CI_FIX_PUSHED: {
          target: 'ci_resolution',
          actions: assign({
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        FAIL: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error ?? 'CI fix failed',
            signals: ({ context, event }) => addSignal(context, event.type),
          }),
        },
      },
    },

    comment_resolution: {
      on: {
        COMMENTS_RESOLVED: {
          target: 'completed',
          actions: assign({
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        COMMENTS_PENDING: [
          {
            guard: ({ context }) =>
              context.commentAttempts < MAX_COMMENT_ATTEMPTS,
            target: 'comment_resolving',
            actions: assign({
              commentAttempts: ({ context }) => context.commentAttempts + 1,
              signals: ({ context, event }) => addSignal(context, event.type),
              lastUpdate: () => new Date().toISOString(),
            }),
          },
          {
            target: 'failed',
            actions: assign({
              error: () =>
                `Comments unresolved after ${MAX_COMMENT_ATTEMPTS} attempts`,
              signals: ({ context, event }) => addSignal(context, event.type),
            }),
          },
        ],
        FAIL: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error ?? 'Comment resolution failed',
            signals: ({ context, event }) => addSignal(context, event.type),
          }),
        },
      },
    },

    comment_resolving: {
      on: {
        COMMENT_FIX_PUSHED: {
          target: 'comment_resolution',
          actions: assign({
            signals: ({ context, event }) => addSignal(context, event.type),
            lastUpdate: () => new Date().toISOString(),
          }),
        },
        FAIL: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error ?? 'Comment fix failed',
            signals: ({ context, event }) => addSignal(context, event.type),
          }),
        },
      },
    },

    completed: {
      type: 'final',
      entry: assign({
        signals: ({ context }) => addSignal(context, 'WORKFLOW_COMPLETE'),
        lastUpdate: () => new Date().toISOString(),
      }),
    },

    failed: {
      type: 'final',
    },
  },
});

/**
 * Get current phase from machine state
 */
export function getCurrentPhase(stateValue: string): WorkflowPhase {
  return stateValue as WorkflowPhase;
}

/**
 * Check if state is terminal
 */
export function isTerminal(stateValue: string): boolean {
  return stateValue === 'completed' || stateValue === 'failed';
}

/**
 * Check if state is success
 */
export function isSuccess(stateValue: string): boolean {
  return stateValue === 'completed';
}
