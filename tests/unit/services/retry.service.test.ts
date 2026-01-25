import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_RETRY_CONFIG,
  createRetryState,
  calculateDelay,
  calculateDelayDeterministic,
  shouldRetry,
  nextRetryState,
  withRetry,
  createRetryable,
  retryWhile,
  type RetryConfig,
} from '../../../src/services/retry.service';

describe('RetryService', () => {
  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.jitterFactor).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_RETRY_CONFIG.jitterFactor).toBeLessThanOrEqual(1);
    });
  });

  describe('createRetryState', () => {
    it('should create initial state with zero attempts', () => {
      const state = createRetryState();

      expect(state.attempt).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.totalDelayMs).toBe(0);
      expect(state.startedAt).toBeGreaterThan(0);
    });
  });

  describe('calculateDelayDeterministic', () => {
    it('should return 0 for attempt 0', () => {
      expect(calculateDelayDeterministic(0)).toBe(0);
    });

    it('should return initialDelay for attempt 1', () => {
      expect(calculateDelayDeterministic(1)).toBe(1000);
    });

    it('should double delay for each subsequent attempt', () => {
      // 1000 * 2^0 = 1000
      expect(calculateDelayDeterministic(1)).toBe(1000);
      // 1000 * 2^1 = 2000
      expect(calculateDelayDeterministic(2)).toBe(2000);
      // 1000 * 2^2 = 4000
      expect(calculateDelayDeterministic(3)).toBe(4000);
    });

    it('should cap at maxDelay', () => {
      // With default config, maxDelay is 30000
      // 1000 * 2^5 = 32000 > 30000
      expect(calculateDelayDeterministic(6)).toBe(30000);
    });

    it('should respect custom config', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        initialDelayMs: 500,
        backoffMultiplier: 3,
        maxDelayMs: 10000,
      };

      expect(calculateDelayDeterministic(1, config)).toBe(500);
      expect(calculateDelayDeterministic(2, config)).toBe(1500); // 500 * 3
      expect(calculateDelayDeterministic(3, config)).toBe(4500); // 500 * 9
      expect(calculateDelayDeterministic(4, config)).toBe(10000); // capped
    });
  });

  describe('calculateDelay', () => {
    it('should add jitter to base delay', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        jitterFactor: 0.5, // 50% jitter
      };

      // With 50% jitter, delay should be within ±50% of base
      const baseDelay = 1000;
      const delays = Array.from({ length: 100 }, () => calculateDelay(1, config));

      // All delays should be within range
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(baseDelay * 0.5);
        expect(delay).toBeLessThanOrEqual(baseDelay * 1.5);
      });

      // Should have some variation (not all the same)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('shouldRetry', () => {
    it('should return true when under max attempts', () => {
      const state = { ...createRetryState(), attempt: 1 };
      expect(shouldRetry(state)).toBe(true);
    });

    it('should return false when at max attempts', () => {
      const state = { ...createRetryState(), attempt: 3 };
      expect(shouldRetry(state)).toBe(false);
    });

    it('should respect custom maxAttempts', () => {
      const state = { ...createRetryState(), attempt: 5 };
      const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 10 };
      expect(shouldRetry(state, config)).toBe(true);
    });
  });

  describe('nextRetryState', () => {
    it('should increment attempt count', () => {
      const state = createRetryState();
      const error = new Error('test');
      const next = nextRetryState(state, error);

      expect(next.attempt).toBe(1);
    });

    it('should store last error', () => {
      const state = createRetryState();
      const error = new Error('test error');
      const next = nextRetryState(state, error);

      expect(next.lastError).toBe(error);
    });

    it('should accumulate total delay', () => {
      let state = createRetryState();
      const error = new Error('test');

      state = nextRetryState(state, error);
      expect(state.totalDelayMs).toBeGreaterThan(0);

      const firstDelay = state.totalDelayMs;
      state = nextRetryState(state, error);
      expect(state.totalDelayMs).toBeGreaterThan(firstDelay);
    });
  });

  describe('withRetry', () => {
    it('should succeed immediately if function succeeds', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('success');
        expect(result.attempts).toBe(1);
      }
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockResolvedValue('success');

      const config = { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 1 };
      const result = await withRetry(fn, config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('success');
        expect(result.attempts).toBe(2);
      }
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2, initialDelayMs: 1 };
      const result = await withRetry(fn, config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('always fails');
        expect(result.attempts).toBe(2);
      }
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should convert non-Error throws to Error', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 1, initialDelayMs: 1 };
      const result = await withRetry(fn, config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe('createRetryable', () => {
    it('should create a retryable wrapper', async () => {
      const original = vi.fn((x: number) => Promise.resolve(x * 2));
      const retryable = createRetryable(original);

      const result = await retryable(5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(10);
      }
    });

    it('should pass arguments correctly', async () => {
      const original = vi.fn((a: string, b: number) => Promise.resolve(`${a}-${b}`));
      const retryable = createRetryable(original);

      const result = await retryable('test', 42);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('test-42');
      }
      expect(original).toHaveBeenCalledWith('test', 42);
    });
  });

  describe('retryWhile', () => {
    it('should stop when condition is false', async () => {
      let callCount = 0;
      const fn = vi.fn(() => {
        callCount++;
        return Promise.resolve(callCount);
      });

      const config = { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 1 };
      const result = await retryWhile(fn, (n) => n < 3, config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(3);
      }
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should return last value when max attempts reached', async () => {
      const fn = vi.fn(() => Promise.resolve('not ready'));

      const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2, initialDelayMs: 1 };
      const result = await retryWhile(fn, () => true, config);

      expect(result.success).toBe(true); // Function succeeded, just condition not met
      if (result.success) {
        expect(result.value).toBe('not ready');
      }
    });

    it('should fail if function throws', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('boom'));

      const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 1, initialDelayMs: 1 };
      const result = await retryWhile(fn, () => true, config);

      expect(result.success).toBe(false);
    });
  });
});
