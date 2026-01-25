/**
 * Workflow State - Pure functional state management
 *
 * Following Functional Core, Imperative Shell pattern.
 * All functions are pure with no side effects - testable without mocks.
 */

export type WorkflowPhase =
  | 'setup'
  | 'planning'
  | 'implementing'
  | 'verifying'
  | 'completed'
  | 'failed';

export interface SetupState {
  phase: 'setup';
  config: WorkflowConfig | null;
  startedAt: string;
}

export interface PlanningState {
  phase: 'planning';
  config: WorkflowConfig;
  startedAt: string;
  planFiles: string[];
}

export interface ImplementingState {
  phase: 'implementing';
  config: WorkflowConfig;
  startedAt: string;
  planFiles: string[];
  currentPlanIndex: number;
  completedPlans: string[];
}

export interface VerifyingState {
  phase: 'verifying';
  config: WorkflowConfig;
  startedAt: string;
  planFiles: string[];
  completedPlans: string[];
  prNumber: number;
  ciRunId: number;
  ciAttempts: number;
}

export interface CompletedState {
  phase: 'completed';
  config: WorkflowConfig;
  startedAt: string;
  completedAt: string;
  planFiles: string[];
  completedPlans: string[];
  prNumber: number;
  prUrl: string;
}

export interface FailedState {
  phase: 'failed';
  config: WorkflowConfig | null;
  startedAt: string;
  failedAt: string;
  error: string;
  previousPhase: WorkflowPhase;
}

export type WorkflowState =
  | SetupState
  | PlanningState
  | ImplementingState
  | VerifyingState
  | CompletedState
  | FailedState;

export interface WorkflowConfig {
  researchFile: string;
  worktreePath: string;
  branch: string;
  maxCIAttempts: number;
}

// State factory functions

export function createInitialState(): SetupState {
  return {
    phase: 'setup',
    config: null,
    startedAt: new Date().toISOString(),
  };
}

export function createInitialStateAt(timestamp: string): SetupState {
  return {
    phase: 'setup',
    config: null,
    startedAt: timestamp,
  };
}

// Transition functions - Pure, return new state or error

export type TransitionResult<T extends WorkflowState> =
  | { success: true; state: T }
  | { success: false; error: string };

export function transitionToPlanning(
  state: SetupState,
  config: WorkflowConfig,
  planFiles: string[]
): TransitionResult<PlanningState> {
  if (state.phase !== 'setup') {
    return { success: false, error: `Cannot transition to planning from ${state.phase}` };
  }
  if (planFiles.length === 0) {
    return { success: false, error: 'Cannot transition to planning without plan files' };
  }

  return {
    success: true,
    state: {
      phase: 'planning',
      config,
      startedAt: state.startedAt,
      planFiles,
    },
  };
}

export function transitionToImplementing(
  state: PlanningState
): TransitionResult<ImplementingState> {
  if (state.phase !== 'planning') {
    return { success: false, error: `Cannot transition to implementing from ${state.phase}` };
  }

  return {
    success: true,
    state: {
      phase: 'implementing',
      config: state.config,
      startedAt: state.startedAt,
      planFiles: state.planFiles,
      currentPlanIndex: 0,
      completedPlans: [],
    },
  };
}

export function completeCurrentPlan(
  state: ImplementingState
): TransitionResult<ImplementingState | VerifyingState> {
  if (state.phase !== 'implementing') {
    return { success: false, error: `Cannot complete plan in phase ${state.phase}` };
  }

  const currentPlan = state.planFiles[state.currentPlanIndex];
  if (!currentPlan) {
    return { success: false, error: 'No current plan to complete' };
  }

  const completedPlans = [...state.completedPlans, currentPlan];
  const nextIndex = state.currentPlanIndex + 1;

  // If all plans completed, we're ready to verify (need PR info first)
  // For now, just advance to next plan or stay in implementing with all done
  if (nextIndex >= state.planFiles.length) {
    // All plans done, return state ready for PR creation
    return {
      success: true,
      state: {
        ...state,
        completedPlans,
        currentPlanIndex: nextIndex,
      },
    };
  }

  return {
    success: true,
    state: {
      ...state,
      completedPlans,
      currentPlanIndex: nextIndex,
    },
  };
}

export function transitionToVerifying(
  state: ImplementingState,
  prNumber: number,
  ciRunId: number
): TransitionResult<VerifyingState> {
  if (state.phase !== 'implementing') {
    return { success: false, error: `Cannot transition to verifying from ${state.phase}` };
  }
  if (state.completedPlans.length !== state.planFiles.length) {
    return { success: false, error: 'Cannot verify until all plans are completed' };
  }

  return {
    success: true,
    state: {
      phase: 'verifying',
      config: state.config,
      startedAt: state.startedAt,
      planFiles: state.planFiles,
      completedPlans: state.completedPlans,
      prNumber,
      ciRunId,
      ciAttempts: 1,
    },
  };
}

export function incrementCIAttempt(
  state: VerifyingState,
  newCIRunId: number
): TransitionResult<VerifyingState | FailedState> {
  if (state.phase !== 'verifying') {
    return { success: false, error: `Cannot increment CI attempt in phase ${state.phase}` };
  }

  const newAttempts = state.ciAttempts + 1;
  if (newAttempts > state.config.maxCIAttempts) {
    return {
      success: true,
      state: {
        phase: 'failed',
        config: state.config,
        startedAt: state.startedAt,
        failedAt: new Date().toISOString(),
        error: `Exceeded maximum CI attempts (${state.config.maxCIAttempts})`,
        previousPhase: 'verifying',
      },
    };
  }

  return {
    success: true,
    state: {
      ...state,
      ciRunId: newCIRunId,
      ciAttempts: newAttempts,
    },
  };
}

export function transitionToCompleted(
  state: VerifyingState,
  prUrl: string
): TransitionResult<CompletedState> {
  if (state.phase !== 'verifying') {
    return { success: false, error: `Cannot transition to completed from ${state.phase}` };
  }

  return {
    success: true,
    state: {
      phase: 'completed',
      config: state.config,
      startedAt: state.startedAt,
      completedAt: new Date().toISOString(),
      planFiles: state.planFiles,
      completedPlans: state.completedPlans,
      prNumber: state.prNumber,
      prUrl,
    },
  };
}

export function transitionToFailed(
  state: WorkflowState,
  error: string
): TransitionResult<FailedState> {
  return {
    success: true,
    state: {
      phase: 'failed',
      config: state.phase === 'setup' ? state.config : (state as Exclude<WorkflowState, SetupState>).config,
      startedAt: state.startedAt,
      failedAt: new Date().toISOString(),
      error,
      previousPhase: state.phase,
    },
  };
}

// Query functions

export function getCurrentPlan(state: ImplementingState): string | null {
  return state.planFiles[state.currentPlanIndex] ?? null;
}

export function getProgress(state: WorkflowState): {
  phase: WorkflowPhase;
  totalPlans: number;
  completedPlans: number;
  percentComplete: number;
} {
  const phase = state.phase;

  if (phase === 'setup') {
    return { phase, totalPlans: 0, completedPlans: 0, percentComplete: 0 };
  }

  if (phase === 'failed') {
    return { phase, totalPlans: 0, completedPlans: 0, percentComplete: 0 };
  }

  const s = state as PlanningState | ImplementingState | VerifyingState | CompletedState;
  const totalPlans = s.planFiles.length;
  const completedPlans =
    'completedPlans' in s ? s.completedPlans.length : 0;
  const percentComplete = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;

  return { phase, totalPlans, completedPlans, percentComplete };
}

export function isTerminalState(state: WorkflowState): state is CompletedState | FailedState {
  return state.phase === 'completed' || state.phase === 'failed';
}

export function canRetry(state: WorkflowState): boolean {
  if (state.phase !== 'verifying') return false;
  return state.ciAttempts < state.config.maxCIAttempts;
}
