import { describe, it, expect } from 'vitest';
import {
  hashError,
  createStuckDetectorState,
  detectStuck,
  resetStuckDetector,
  getStuckStatus,
  hasSeenErrors,
  categorizeError,
  createCategoryAwareState,
  detectStuckWithCategory,
  type StuckDetectorState,
} from '../../../src/core/error-detector';

describe('ErrorDetector', () => {
  describe('hashError', () => {
    it('should generate consistent hash for same error', () => {
      const error = 'Error: Module not found';
      expect(hashError(error)).toBe(hashError(error));
    });

    it('should generate different hashes for different errors', () => {
      const error1 = 'Error: Module not found';
      const error2 = 'Error: Network timeout';
      expect(hashError(error1)).not.toBe(hashError(error2));
    });

    it('should generate 32-character hex string (MD5)', () => {
      const hash = hashError('test');
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('createStuckDetectorState', () => {
    it('should create initial state with null hash and zero count', () => {
      const state = createStuckDetectorState();

      expect(state.lastErrorHash).toBeNull();
      expect(state.stuckCount).toBe(0);
    });
  });

  describe('detectStuck', () => {
    it('should not be stuck on first error', () => {
      const state = createStuckDetectorState();
      const result = detectStuck(state, 'Error: Module not found');

      expect(result.isStuck).toBe(false);
      expect(result.nextState.stuckCount).toBe(1);
    });

    it('should not be stuck on second identical error', () => {
      let state = createStuckDetectorState();
      const error = 'Error: Module not found';

      state = detectStuck(state, error).nextState;
      const result = detectStuck(state, error);

      expect(result.isStuck).toBe(false);
      expect(result.nextState.stuckCount).toBe(2);
    });

    it('should be stuck after 3 identical errors (default threshold)', () => {
      let state = createStuckDetectorState();
      const error = 'Error: Module not found';

      state = detectStuck(state, error).nextState;
      state = detectStuck(state, error).nextState;
      const result = detectStuck(state, error);

      expect(result.isStuck).toBe(true);
      expect(result.nextState.stuckCount).toBe(3);
    });

    it('should reset counter when error changes', () => {
      let state = createStuckDetectorState();

      state = detectStuck(state, 'Error: Module not found').nextState;
      state = detectStuck(state, 'Error: Module not found').nextState;
      const result = detectStuck(state, 'Error: Network timeout');

      expect(result.isStuck).toBe(false);
      expect(result.nextState.stuckCount).toBe(1);
    });

    it('should respect custom threshold', () => {
      let state = createStuckDetectorState();
      const error = 'Error: Build failed';

      // With threshold 2, should be stuck after 2 identical errors
      state = detectStuck(state, error, 2).nextState;
      const result = detectStuck(state, error, 2);

      expect(result.isStuck).toBe(true);
    });

    it('should track hash correctly across multiple errors', () => {
      let state = createStuckDetectorState();

      state = detectStuck(state, 'Error A').nextState;
      expect(state.lastErrorHash).toBe(hashError('Error A'));

      state = detectStuck(state, 'Error B').nextState;
      expect(state.lastErrorHash).toBe(hashError('Error B'));
      expect(state.stuckCount).toBe(1);
    });
  });

  describe('resetStuckDetector', () => {
    it('should return fresh initial state', () => {
      const freshState = resetStuckDetector();

      expect(freshState.lastErrorHash).toBeNull();
      expect(freshState.stuckCount).toBe(0);
    });
  });

  describe('getStuckStatus', () => {
    it('should report no errors for initial state', () => {
      const state = createStuckDetectorState();
      expect(getStuckStatus(state)).toBe('No errors recorded');
    });

    it('should report count for state with errors', () => {
      const state: StuckDetectorState = {
        lastErrorHash: 'abc123',
        stuckCount: 2,
      };
      expect(getStuckStatus(state)).toBe('2 identical error(s) detected');
    });
  });

  describe('hasSeenErrors', () => {
    it('should return false for initial state', () => {
      const state = createStuckDetectorState();
      expect(hasSeenErrors(state)).toBe(false);
    });

    it('should return true after seeing an error', () => {
      let state = createStuckDetectorState();
      state = detectStuck(state, 'Error').nextState;
      expect(hasSeenErrors(state)).toBe(true);
    });
  });

  describe('categorizeError', () => {
    it('should categorize build failures', () => {
      expect(categorizeError('Build failed with exit code 1')).toBe('build_failure');
      expect(categorizeError('Compilation error in main.ts')).toBe('build_failure');
    });

    it('should categorize test failures', () => {
      expect(categorizeError('Test failed: expected true')).toBe('test_failure');
      expect(categorizeError('AssertionError: values not equal')).toBe('test_failure');
    });

    it('should categorize lint errors', () => {
      expect(categorizeError('ESLint: no-unused-vars')).toBe('lint_error');
      expect(categorizeError('Lint errors found')).toBe('lint_error');
    });

    it('should categorize type errors', () => {
      expect(categorizeError('Type error: cannot assign')).toBe('type_error');
      expect(categorizeError('TS2345: Argument of type')).toBe('type_error');
    });

    it('should categorize timeouts', () => {
      expect(categorizeError('Operation timed out after 30s')).toBe('timeout');
      expect(categorizeError('Timeout waiting for response')).toBe('timeout');
    });

    it('should categorize network errors', () => {
      expect(categorizeError('Network error: ECONNREFUSED')).toBe('network_error');
      expect(categorizeError('Connection refused')).toBe('network_error');
    });

    it('should return unknown for unrecognized errors', () => {
      expect(categorizeError('Something weird happened')).toBe('unknown');
    });
  });

  describe('detectStuckWithCategory', () => {
    it('should detect stuck by exact match', () => {
      let state = createCategoryAwareState();
      const error = 'Build failed: missing import';

      state = detectStuckWithCategory(state, error).nextState;
      state = detectStuckWithCategory(state, error).nextState;
      const result = detectStuckWithCategory(state, error);

      expect(result.isStuck).toBe(true);
      expect(result.stuckReason).toBe('exact_match');
    });

    it('should detect stuck by category after threshold', () => {
      let state = createCategoryAwareState();

      // Different build errors but same category
      state = detectStuckWithCategory(state, 'Build failed: error 1').nextState;
      state = detectStuckWithCategory(state, 'Build failed: error 2').nextState;
      state = detectStuckWithCategory(state, 'Build failed: error 3').nextState;
      state = detectStuckWithCategory(state, 'Build failed: error 4').nextState;
      const result = detectStuckWithCategory(state, 'Build failed: error 5');

      expect(result.isStuck).toBe(true);
      expect(result.stuckReason).toBe('category_match');
    });

    it('should not consider unknown category for category matching', () => {
      let state = createCategoryAwareState();

      // All unknown category - should only trigger on exact match
      state = detectStuckWithCategory(state, 'Strange error 1').nextState;
      state = detectStuckWithCategory(state, 'Strange error 2').nextState;
      state = detectStuckWithCategory(state, 'Strange error 3').nextState;
      state = detectStuckWithCategory(state, 'Strange error 4').nextState;
      const result = detectStuckWithCategory(state, 'Strange error 5');

      // Not stuck because unknown doesn't count for category
      expect(result.isStuck).toBe(false);
    });

    it('should reset category count when category changes', () => {
      let state = createCategoryAwareState();

      state = detectStuckWithCategory(state, 'Build failed: error 1').nextState;
      state = detectStuckWithCategory(state, 'Build failed: error 2').nextState;
      // Switch to test failure
      const result = detectStuckWithCategory(state, 'Test failed: assertion');

      expect(result.nextState.categoryCount).toBe(1);
      expect(result.isStuck).toBe(false);
    });
  });
});
