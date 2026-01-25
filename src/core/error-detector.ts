/**
 * Error Detector - Hash-based stuck detection
 *
 * Ported from ci-ralph.sh detect_stuck function.
 * Pure functions with no side effects - testable without mocks.
 */

import { createHash } from 'crypto';

export interface StuckDetectorState {
  lastErrorHash: string | null;
  stuckCount: number;
}

export interface StuckDetectionResult {
  isStuck: boolean;
  nextState: StuckDetectorState;
}

/**
 * Hash an error string for comparison.
 * Uses MD5 for consistency with the original shell script.
 */
export function hashError(error: string): string {
  return createHash('md5').update(error).digest('hex');
}

/**
 * Create initial stuck detector state.
 */
export function createStuckDetectorState(): StuckDetectorState {
  return {
    lastErrorHash: null,
    stuckCount: 0,
  };
}

/**
 * Detect if we're stuck on the same error.
 *
 * @param state - Current detector state
 * @param currentError - The current error string
 * @param threshold - Number of identical errors before considered stuck (default: 3)
 * @returns Detection result with new state
 */
export function detectStuck(
  state: StuckDetectorState,
  currentError: string,
  threshold = 3
): StuckDetectionResult {
  const currentHash = hashError(currentError);

  if (currentHash === state.lastErrorHash) {
    const newCount = state.stuckCount + 1;
    return {
      isStuck: newCount >= threshold,
      nextState: {
        lastErrorHash: currentHash,
        stuckCount: newCount,
      },
    };
  }

  // Different error, reset counter
  return {
    isStuck: false,
    nextState: {
      lastErrorHash: currentHash,
      stuckCount: 1,
    },
  };
}

/**
 * Reset stuck detector state.
 */
export function resetStuckDetector(): StuckDetectorState {
  return createStuckDetectorState();
}

/**
 * Get human-readable stuck status.
 */
export function getStuckStatus(state: StuckDetectorState): string {
  if (state.lastErrorHash === null) {
    return 'No errors recorded';
  }
  return `${state.stuckCount} identical error(s) detected`;
}

/**
 * Check if detector has seen any errors.
 */
export function hasSeenErrors(state: StuckDetectorState): boolean {
  return state.lastErrorHash !== null;
}

/**
 * Error categorization for better stuck detection
 */
export type ErrorCategory =
  | 'build_failure'
  | 'test_failure'
  | 'lint_error'
  | 'type_error'
  | 'timeout'
  | 'network_error'
  | 'unknown';

/**
 * Categorize an error based on common patterns.
 */
export function categorizeError(error: string): ErrorCategory {
  const lowerError = error.toLowerCase();

  if (lowerError.includes('build failed') || lowerError.includes('compilation error')) {
    return 'build_failure';
  }
  if (lowerError.includes('test failed') || lowerError.includes('assertion')) {
    return 'test_failure';
  }
  if (lowerError.includes('lint') || lowerError.includes('eslint')) {
    return 'lint_error';
  }
  if (lowerError.includes('type error') || lowerError.includes('ts2')) {
    return 'type_error';
  }
  if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
    return 'timeout';
  }
  if (lowerError.includes('network') || lowerError.includes('connection')) {
    return 'network_error';
  }

  return 'unknown';
}

/**
 * Enhanced stuck detector that considers error categories.
 * Same category errors count toward stuck detection even if text differs slightly.
 */
export interface CategoryAwareStuckState {
  lastErrorHash: string | null;
  lastCategory: ErrorCategory | null;
  categoryCount: number;
  exactCount: number;
}

export function createCategoryAwareState(): CategoryAwareStuckState {
  return {
    lastErrorHash: null,
    lastCategory: null,
    categoryCount: 0,
    exactCount: 0,
  };
}

export interface CategoryAwareResult {
  isStuck: boolean;
  stuckReason: 'exact_match' | 'category_match' | null;
  nextState: CategoryAwareStuckState;
}

/**
 * Detect stuck with category awareness.
 * Considers both exact matches and category matches for stuck detection.
 *
 * @param state - Current state
 * @param currentError - Current error string
 * @param exactThreshold - Exact match threshold (default: 3)
 * @param categoryThreshold - Category match threshold (default: 5)
 */
export function detectStuckWithCategory(
  state: CategoryAwareStuckState,
  currentError: string,
  exactThreshold = 3,
  categoryThreshold = 5
): CategoryAwareResult {
  const currentHash = hashError(currentError);
  const currentCategory = categorizeError(currentError);

  const isExactMatch = currentHash === state.lastErrorHash;
  const isCategoryMatch = currentCategory === state.lastCategory && currentCategory !== 'unknown';

  const newExactCount = isExactMatch ? state.exactCount + 1 : 1;
  const newCategoryCount = isCategoryMatch ? state.categoryCount + 1 : 1;

  const stuckByExact = newExactCount >= exactThreshold;
  const stuckByCategory = newCategoryCount >= categoryThreshold;

  return {
    isStuck: stuckByExact || stuckByCategory,
    stuckReason: stuckByExact ? 'exact_match' : stuckByCategory ? 'category_match' : null,
    nextState: {
      lastErrorHash: currentHash,
      lastCategory: currentCategory,
      categoryCount: newCategoryCount,
      exactCount: newExactCount,
    },
  };
}
