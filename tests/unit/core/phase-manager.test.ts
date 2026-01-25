import { describe, it, expect } from 'vitest';
import {
  canTransition,
  transition,
  getValidTransitions,
  isTerminal,
  isSuccess,
  isFailure,
  getPhaseName,
  getPhaseDescription,
  getAllPhases,
  getHappyPathPhases,
  getPhaseProgress,
  getNextHappyPhase,
  transitionThrough,
  getPhaseInfo,
  type Phase,
} from '../../../src/core/phase-manager';

describe('PhaseManager', () => {
  describe('canTransition', () => {
    it('should allow setup → planning', () => {
      expect(canTransition('setup', 'planning')).toBe(true);
    });

    it('should allow setup → failed', () => {
      expect(canTransition('setup', 'failed')).toBe(true);
    });

    it('should not allow setup → completed', () => {
      expect(canTransition('setup', 'completed')).toBe(false);
    });

    it('should allow planning → implementing', () => {
      expect(canTransition('planning', 'implementing')).toBe(true);
    });

    it('should allow implementing → verifying', () => {
      expect(canTransition('implementing', 'verifying')).toBe(true);
    });

    it('should allow verifying → completed', () => {
      expect(canTransition('verifying', 'completed')).toBe(true);
    });

    it('should allow verifying → implementing (retry)', () => {
      expect(canTransition('verifying', 'implementing')).toBe(true);
    });

    it('should not allow completed → anything', () => {
      expect(canTransition('completed', 'setup')).toBe(false);
      expect(canTransition('completed', 'planning')).toBe(false);
      expect(canTransition('completed', 'failed')).toBe(false);
    });

    it('should not allow failed → anything', () => {
      expect(canTransition('failed', 'setup')).toBe(false);
      expect(canTransition('failed', 'planning')).toBe(false);
      expect(canTransition('failed', 'completed')).toBe(false);
    });

    it('should not allow backwards transitions (except verifying → implementing)', () => {
      expect(canTransition('planning', 'setup')).toBe(false);
      expect(canTransition('implementing', 'planning')).toBe(false);
      expect(canTransition('verifying', 'planning')).toBe(false);
    });
  });

  describe('transition', () => {
    it('should return success for valid transition', () => {
      const result = transition('setup', 'planning');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.phase).toBe('planning');
      }
    });

    it('should return error for invalid transition', () => {
      const result = transition('setup', 'completed');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('invalid_transition');
        expect(result.error.from).toBe('setup');
        expect(result.error.to).toBe('completed');
        expect(result.error.message).toContain('Cannot transition');
      }
    });

    it('should include valid transitions in error message', () => {
      const result = transition('setup', 'completed');

      if (!result.success) {
        expect(result.error.message).toContain('planning');
        expect(result.error.message).toContain('failed');
      }
    });
  });

  describe('getValidTransitions', () => {
    it('should return valid transitions for setup', () => {
      expect(getValidTransitions('setup')).toEqual(['planning', 'failed']);
    });

    it('should return valid transitions for verifying (includes retry)', () => {
      const transitions = getValidTransitions('verifying');
      expect(transitions).toContain('completed');
      expect(transitions).toContain('implementing');
      expect(transitions).toContain('failed');
    });

    it('should return empty array for terminal states', () => {
      expect(getValidTransitions('completed')).toEqual([]);
      expect(getValidTransitions('failed')).toEqual([]);
    });
  });

  describe('isTerminal', () => {
    it('should return true for completed', () => {
      expect(isTerminal('completed')).toBe(true);
    });

    it('should return true for failed', () => {
      expect(isTerminal('failed')).toBe(true);
    });

    it('should return false for non-terminal phases', () => {
      expect(isTerminal('setup')).toBe(false);
      expect(isTerminal('planning')).toBe(false);
      expect(isTerminal('implementing')).toBe(false);
      expect(isTerminal('verifying')).toBe(false);
    });
  });

  describe('isSuccess / isFailure', () => {
    it('should identify completed as success', () => {
      expect(isSuccess('completed')).toBe(true);
      expect(isFailure('completed')).toBe(false);
    });

    it('should identify failed as failure', () => {
      expect(isSuccess('failed')).toBe(false);
      expect(isFailure('failed')).toBe(true);
    });

    it('should not identify non-terminal as success/failure', () => {
      expect(isSuccess('verifying')).toBe(false);
      expect(isFailure('verifying')).toBe(false);
    });
  });

  describe('getPhaseName', () => {
    it('should return human-readable names', () => {
      expect(getPhaseName('setup')).toBe('Setup');
      expect(getPhaseName('planning')).toBe('Planning');
      expect(getPhaseName('implementing')).toBe('Implementing');
      expect(getPhaseName('verifying')).toBe('Verifying');
      expect(getPhaseName('completed')).toBe('Completed');
      expect(getPhaseName('failed')).toBe('Failed');
    });
  });

  describe('getPhaseDescription', () => {
    it('should return descriptions for each phase', () => {
      expect(getPhaseDescription('setup')).toContain('workspace');
      expect(getPhaseDescription('planning')).toContain('plan');
      expect(getPhaseDescription('implementing')).toContain('Executing');
      expect(getPhaseDescription('verifying')).toContain('CI');
      expect(getPhaseDescription('completed')).toContain('successfully');
      expect(getPhaseDescription('failed')).toContain('error');
    });
  });

  describe('getAllPhases', () => {
    it('should return all 6 phases', () => {
      const phases = getAllPhases();
      expect(phases).toHaveLength(6);
      expect(phases).toContain('setup');
      expect(phases).toContain('completed');
      expect(phases).toContain('failed');
    });
  });

  describe('getHappyPathPhases', () => {
    it('should return phases excluding failed', () => {
      const phases = getHappyPathPhases();
      expect(phases).toHaveLength(5);
      expect(phases).not.toContain('failed');
      expect(phases).toEqual(['setup', 'planning', 'implementing', 'verifying', 'completed']);
    });
  });

  describe('getPhaseProgress', () => {
    it('should return 20% for setup', () => {
      expect(getPhaseProgress('setup')).toBe(20);
    });

    it('should return 40% for planning', () => {
      expect(getPhaseProgress('planning')).toBe(40);
    });

    it('should return 60% for implementing', () => {
      expect(getPhaseProgress('implementing')).toBe(60);
    });

    it('should return 80% for verifying', () => {
      expect(getPhaseProgress('verifying')).toBe(80);
    });

    it('should return 100% for completed', () => {
      expect(getPhaseProgress('completed')).toBe(100);
    });

    it('should return 0% for failed', () => {
      expect(getPhaseProgress('failed')).toBe(0);
    });
  });

  describe('getNextHappyPhase', () => {
    it('should return planning for setup', () => {
      expect(getNextHappyPhase('setup')).toBe('planning');
    });

    it('should return implementing for planning', () => {
      expect(getNextHappyPhase('planning')).toBe('implementing');
    });

    it('should return null for completed', () => {
      expect(getNextHappyPhase('completed')).toBeNull();
    });

    it('should return null for failed', () => {
      expect(getNextHappyPhase('failed')).toBeNull();
    });
  });

  describe('transitionThrough', () => {
    it('should execute multiple transitions', () => {
      const result = transitionThrough('setup', ['planning', 'implementing']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.phase).toBe('implementing');
      }
    });

    it('should stop on invalid transition', () => {
      const result = transitionThrough('setup', ['planning', 'completed']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.from).toBe('planning');
        expect(result.error.to).toBe('completed');
      }
    });

    it('should handle empty target array', () => {
      const result = transitionThrough('setup', []);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.phase).toBe('setup');
      }
    });

    it('should execute full happy path', () => {
      const result = transitionThrough('setup', [
        'planning',
        'implementing',
        'verifying',
        'completed',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.phase).toBe('completed');
      }
    });
  });

  describe('getPhaseInfo', () => {
    it('should return comprehensive info for a phase', () => {
      const info = getPhaseInfo('verifying');

      expect(info.phase).toBe('verifying');
      expect(info.name).toBe('Verifying');
      expect(info.description).toContain('CI');
      expect(info.isTerminal).toBe(false);
      expect(info.isSuccess).toBe(false);
      expect(info.isFailure).toBe(false);
      expect(info.progress).toBe(80);
      expect(info.validTransitions).toContain('completed');
      expect(info.validTransitions).toContain('implementing');
    });

    it('should return correct info for completed', () => {
      const info = getPhaseInfo('completed');

      expect(info.isTerminal).toBe(true);
      expect(info.isSuccess).toBe(true);
      expect(info.isFailure).toBe(false);
      expect(info.progress).toBe(100);
      expect(info.validTransitions).toEqual([]);
    });
  });
});
