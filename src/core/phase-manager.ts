/**
 * Phase Manager - Workflow phase orchestration
 *
 * Pure functions for managing phase transitions.
 * Follows the state machine: Setup → Planning → Implementing → Verifying → Completed/Failed
 */

export type Phase =
  | 'setup'
  | 'planning'
  | 'implementing'
  | 'verifying'
  | 'completed'
  | 'failed';

/**
 * Valid transitions from each phase
 */
const VALID_TRANSITIONS: Record<Phase, Phase[]> = {
  setup: ['planning', 'failed'],
  planning: ['implementing', 'failed'],
  implementing: ['verifying', 'failed'],
  verifying: ['completed', 'implementing', 'failed'], // Can retry implementing
  completed: [], // Terminal state
  failed: [], // Terminal state
};

/**
 * Phase display names
 */
const PHASE_NAMES: Record<Phase, string> = {
  setup: 'Setup',
  planning: 'Planning',
  implementing: 'Implementing',
  verifying: 'Verifying',
  completed: 'Completed',
  failed: 'Failed',
};

/**
 * Phase descriptions
 */
const PHASE_DESCRIPTIONS: Record<Phase, string> = {
  setup: 'Initializing workspace and configuration',
  planning: 'Generating implementation plans from research',
  implementing: 'Executing implementation plans',
  verifying: 'Waiting for CI to pass',
  completed: 'Workflow completed successfully',
  failed: 'Workflow encountered an error',
};

export interface TransitionError {
  type: 'invalid_transition';
  from: Phase;
  to: Phase;
  message: string;
}

export type TransitionResult =
  | { success: true; phase: Phase }
  | { success: false; error: TransitionError };

/**
 * Check if a transition is valid
 */
export function canTransition(from: Phase, to: Phase): boolean {
  const validTargets = VALID_TRANSITIONS[from];
  return validTargets?.includes(to) ?? false;
}

/**
 * Attempt a phase transition
 */
export function transition(from: Phase, to: Phase): TransitionResult {
  if (canTransition(from, to)) {
    return { success: true, phase: to };
  }

  return {
    success: false,
    error: {
      type: 'invalid_transition',
      from,
      to,
      message: `Cannot transition from '${from}' to '${to}'. Valid transitions: ${getValidTransitions(from).join(', ') || 'none'}`,
    },
  };
}

/**
 * Get valid transitions from a phase
 */
export function getValidTransitions(phase: Phase): Phase[] {
  return VALID_TRANSITIONS[phase] ?? [];
}

/**
 * Check if phase is terminal (no further transitions possible)
 */
export function isTerminal(phase: Phase): boolean {
  return phase === 'completed' || phase === 'failed';
}

/**
 * Check if phase is a success terminal state
 */
export function isSuccess(phase: Phase): boolean {
  return phase === 'completed';
}

/**
 * Check if phase is a failure terminal state
 */
export function isFailure(phase: Phase): boolean {
  return phase === 'failed';
}

/**
 * Get display name for a phase
 */
export function getPhaseName(phase: Phase): string {
  return PHASE_NAMES[phase];
}

/**
 * Get description for a phase
 */
export function getPhaseDescription(phase: Phase): string {
  return PHASE_DESCRIPTIONS[phase];
}

/**
 * Get all phases in order
 */
export function getAllPhases(): Phase[] {
  return ['setup', 'planning', 'implementing', 'verifying', 'completed', 'failed'];
}

/**
 * Get happy path phases (excluding failed)
 */
export function getHappyPathPhases(): Phase[] {
  return ['setup', 'planning', 'implementing', 'verifying', 'completed'];
}

/**
 * Calculate progress through happy path (0-100)
 */
export function getPhaseProgress(phase: Phase): number {
  const happyPath = getHappyPathPhases();
  const index = happyPath.indexOf(phase);

  if (phase === 'failed') {
    return 0; // Failed doesn't count as progress
  }

  if (index === -1) {
    return 0;
  }

  // completed = 100%, verifying = 80%, implementing = 60%, planning = 40%, setup = 20%
  return Math.round(((index + 1) / happyPath.length) * 100);
}

/**
 * Get next phase in happy path (or null if terminal)
 */
export function getNextHappyPhase(phase: Phase): Phase | null {
  const happyPath = getHappyPathPhases();
  const index = happyPath.indexOf(phase);

  if (index === -1 || index === happyPath.length - 1) {
    return null;
  }

  return happyPath[index + 1] ?? null;
}

/**
 * Execute a sequence of transitions, stopping on first failure
 */
export function transitionThrough(
  startPhase: Phase,
  targetPhases: Phase[]
): TransitionResult {
  let currentPhase = startPhase;

  for (const target of targetPhases) {
    const result = transition(currentPhase, target);
    if (!result.success) {
      return result;
    }
    currentPhase = result.phase;
  }

  return { success: true, phase: currentPhase };
}

/**
 * Phase metadata for UI display
 */
export interface PhaseInfo {
  phase: Phase;
  name: string;
  description: string;
  isTerminal: boolean;
  isSuccess: boolean;
  isFailure: boolean;
  progress: number;
  validTransitions: Phase[];
}

/**
 * Get comprehensive phase info
 */
export function getPhaseInfo(phase: Phase): PhaseInfo {
  return {
    phase,
    name: getPhaseName(phase),
    description: getPhaseDescription(phase),
    isTerminal: isTerminal(phase),
    isSuccess: isSuccess(phase),
    isFailure: isFailure(phase),
    progress: getPhaseProgress(phase),
    validTransitions: getValidTransitions(phase),
  };
}
