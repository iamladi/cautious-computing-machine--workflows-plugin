/**
 * Retry Service - Exponential backoff and retry logic
 *
 * Pure functions for retry strategies with configurable backoff.
 * Can be used with Effect-TS or standalone.
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // 0-1, adds randomness to prevent thundering herd
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

export interface RetryState {
  attempt: number;
  lastError: Error | null;
  totalDelayMs: number;
  startedAt: number;
}

export function createRetryState(): RetryState {
  return {
    attempt: 0,
    lastError: null,
    totalDelayMs: 0,
    startedAt: Date.now(),
  };
}

/**
 * Calculate delay for next retry attempt
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  if (attempt === 0) return 0;

  // Exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

  // Apply max delay cap
  delay = Math.min(delay, config.maxDelayMs);

  // Apply jitter
  if (config.jitterFactor > 0) {
    const jitter = delay * config.jitterFactor * (Math.random() * 2 - 1);
    delay = Math.max(0, delay + jitter);
  }

  return Math.round(delay);
}

/**
 * Calculate delay without jitter (for deterministic testing)
 */
export function calculateDelayDeterministic(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  if (attempt === 0) return 0;

  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, config.maxDelayMs);

  return Math.round(delay);
}

/**
 * Check if should retry based on current state
 */
export function shouldRetry(
  state: RetryState,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  return state.attempt < config.maxAttempts;
}

/**
 * Get next retry state after a failed attempt
 */
export function nextRetryState(
  state: RetryState,
  error: Error,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): RetryState {
  const delay = calculateDelay(state.attempt + 1, config);
  return {
    attempt: state.attempt + 1,
    lastError: error,
    totalDelayMs: state.totalDelayMs + delay,
    startedAt: state.startedAt,
  };
}

/**
 * Retry result type
 */
export type RetryResult<T> =
  | { success: true; value: T; attempts: number; totalDelayMs: number }
  | { success: false; error: Error; attempts: number; totalDelayMs: number };

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<RetryResult<T>> {
  let state = createRetryState();

  while (true) {
    try {
      const value = await fn();
      return {
        success: true,
        value,
        attempts: state.attempt + 1,
        totalDelayMs: state.totalDelayMs,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      state = nextRetryState(state, error, config);

      if (!shouldRetry(state, config)) {
        return {
          success: false,
          error,
          attempts: state.attempt,
          totalDelayMs: state.totalDelayMs,
        };
      }

      const delay = calculateDelay(state.attempt, config);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Create a retryable wrapper for a function
 */
export function createRetryable<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): (...args: Args) => Promise<RetryResult<T>> {
  return (...args: Args) => withRetry(() => fn(...args), config);
}

/**
 * Predicate-based retry (retry while condition is true)
 */
export async function retryWhile<T>(
  fn: () => Promise<T>,
  shouldContinue: (result: T) => boolean,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<RetryResult<T>> {
  let state = createRetryState();

  while (true) {
    try {
      const value = await fn();

      if (!shouldContinue(value)) {
        return {
          success: true,
          value,
          attempts: state.attempt + 1,
          totalDelayMs: state.totalDelayMs,
        };
      }

      // Result doesn't meet condition, treat as "retry needed"
      state = nextRetryState(state, new Error('Condition not met'), config);

      if (!shouldRetry(state, config)) {
        return {
          success: true, // Function succeeded, just condition not met
          value,
          attempts: state.attempt,
          totalDelayMs: state.totalDelayMs,
        };
      }

      const delay = calculateDelay(state.attempt, config);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      state = nextRetryState(state, error, config);

      if (!shouldRetry(state, config)) {
        return {
          success: false,
          error,
          attempts: state.attempt,
          totalDelayMs: state.totalDelayMs,
        };
      }

      const delay = calculateDelay(state.attempt, config);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
