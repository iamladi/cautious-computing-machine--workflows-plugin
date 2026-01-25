import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  createInitialStateAt,
  transitionToPlanning,
  transitionToImplementing,
  completeCurrentPlan,
  transitionToVerifying,
  incrementCIAttempt,
  transitionToCompleted,
  transitionToFailed,
  getCurrentPlan,
  getProgress,
  isTerminalState,
  canRetry,
  type WorkflowConfig,
  type SetupState,
  type PlanningState,
  type ImplementingState,
  type VerifyingState,
} from '../../../src/core/workflow-state';

const mockConfig: WorkflowConfig = {
  researchFile: 'research/test.md',
  worktreePath: '/path/to/worktree',
  branch: 'feat/test',
  maxCIAttempts: 3,
};

const mockPlanFiles = ['plans/plan-1.md', 'plans/plan-2.md', 'plans/plan-3.md'];

describe('WorkflowState', () => {
  describe('createInitialState', () => {
    it('should create state in setup phase with null config', () => {
      const state = createInitialState();

      expect(state.phase).toBe('setup');
      expect(state.config).toBeNull();
      expect(state.startedAt).toBeDefined();
    });

    it('should create state with specific timestamp', () => {
      const timestamp = '2026-01-25T12:00:00Z';
      const state = createInitialStateAt(timestamp);

      expect(state.startedAt).toBe(timestamp);
    });
  });

  describe('transitionToPlanning', () => {
    it('should transition from setup to planning with config and plans', () => {
      const setupState = createInitialState();
      const result = transitionToPlanning(setupState, mockConfig, mockPlanFiles);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('planning');
        expect(result.state.config).toBe(mockConfig);
        expect(result.state.planFiles).toEqual(mockPlanFiles);
        expect(result.state.startedAt).toBe(setupState.startedAt);
      }
    });

    it('should fail when transitioning with empty plan files', () => {
      const setupState = createInitialState();
      const result = transitionToPlanning(setupState, mockConfig, []);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('without plan files');
      }
    });
  });

  describe('transitionToImplementing', () => {
    it('should transition from planning to implementing', () => {
      const planningState: PlanningState = {
        phase: 'planning',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
      };
      const result = transitionToImplementing(planningState);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('implementing');
        expect(result.state.currentPlanIndex).toBe(0);
        expect(result.state.completedPlans).toEqual([]);
      }
    });
  });

  describe('completeCurrentPlan', () => {
    it('should advance to next plan when completing current', () => {
      const implState: ImplementingState = {
        phase: 'implementing',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
        currentPlanIndex: 0,
        completedPlans: [],
      };
      const result = completeCurrentPlan(implState);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('implementing');
        const state = result.state as ImplementingState;
        expect(state.currentPlanIndex).toBe(1);
        expect(state.completedPlans).toEqual(['plans/plan-1.md']);
      }
    });

    it('should complete all plans and stay in implementing (ready for PR)', () => {
      const implState: ImplementingState = {
        phase: 'implementing',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
        currentPlanIndex: 2,
        completedPlans: ['plans/plan-1.md', 'plans/plan-2.md'],
      };
      const result = completeCurrentPlan(implState);

      expect(result.success).toBe(true);
      if (result.success) {
        const state = result.state as ImplementingState;
        expect(state.completedPlans.length).toBe(3);
        expect(state.currentPlanIndex).toBe(3);
      }
    });
  });

  describe('transitionToVerifying', () => {
    it('should transition when all plans are completed', () => {
      const implState: ImplementingState = {
        phase: 'implementing',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
        currentPlanIndex: 3,
        completedPlans: [...mockPlanFiles],
      };
      const result = transitionToVerifying(implState, 123, 456);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('verifying');
        expect(result.state.prNumber).toBe(123);
        expect(result.state.ciRunId).toBe(456);
        expect(result.state.ciAttempts).toBe(1);
      }
    });

    it('should fail when not all plans are completed', () => {
      const implState: ImplementingState = {
        phase: 'implementing',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
        currentPlanIndex: 1,
        completedPlans: ['plans/plan-1.md'],
      };
      const result = transitionToVerifying(implState, 123, 456);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('all plans');
      }
    });
  });

  describe('incrementCIAttempt', () => {
    it('should increment attempt count', () => {
      const verifyState: VerifyingState = {
        phase: 'verifying',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
        completedPlans: mockPlanFiles,
        prNumber: 123,
        ciRunId: 456,
        ciAttempts: 1,
      };
      const result = incrementCIAttempt(verifyState, 789);

      expect(result.success).toBe(true);
      if (result.success && result.state.phase === 'verifying') {
        expect(result.state.ciAttempts).toBe(2);
        expect(result.state.ciRunId).toBe(789);
      }
    });

    it('should transition to failed when max attempts exceeded', () => {
      const verifyState: VerifyingState = {
        phase: 'verifying',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
        completedPlans: mockPlanFiles,
        prNumber: 123,
        ciRunId: 456,
        ciAttempts: 3,
      };
      const result = incrementCIAttempt(verifyState, 789);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('failed');
        if (result.state.phase === 'failed') {
          expect(result.state.error).toContain('maximum CI attempts');
        }
      }
    });
  });

  describe('transitionToCompleted', () => {
    it('should transition to completed with PR URL', () => {
      const verifyState: VerifyingState = {
        phase: 'verifying',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
        completedPlans: mockPlanFiles,
        prNumber: 123,
        ciRunId: 456,
        ciAttempts: 1,
      };
      const result = transitionToCompleted(verifyState, 'https://github.com/repo/pull/123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('completed');
        expect(result.state.prUrl).toBe('https://github.com/repo/pull/123');
        expect(result.state.completedAt).toBeDefined();
      }
    });
  });

  describe('transitionToFailed', () => {
    it('should transition any state to failed', () => {
      const planningState: PlanningState = {
        phase: 'planning',
        config: mockConfig,
        startedAt: '2026-01-25T12:00:00Z',
        planFiles: mockPlanFiles,
      };
      const result = transitionToFailed(planningState, 'Something went wrong');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('failed');
        expect(result.state.error).toBe('Something went wrong');
        expect(result.state.previousPhase).toBe('planning');
      }
    });
  });

  describe('Query functions', () => {
    describe('getCurrentPlan', () => {
      it('should return current plan file', () => {
        const implState: ImplementingState = {
          phase: 'implementing',
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          planFiles: mockPlanFiles,
          currentPlanIndex: 1,
          completedPlans: ['plans/plan-1.md'],
        };

        expect(getCurrentPlan(implState)).toBe('plans/plan-2.md');
      });

      it('should return null when all plans done', () => {
        const implState: ImplementingState = {
          phase: 'implementing',
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          planFiles: mockPlanFiles,
          currentPlanIndex: 3,
          completedPlans: mockPlanFiles,
        };

        expect(getCurrentPlan(implState)).toBeNull();
      });
    });

    describe('getProgress', () => {
      it('should return 0% for setup phase', () => {
        const state = createInitialState();
        const progress = getProgress(state);

        expect(progress.phase).toBe('setup');
        expect(progress.percentComplete).toBe(0);
      });

      it('should calculate correct progress during implementation', () => {
        const implState: ImplementingState = {
          phase: 'implementing',
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          planFiles: mockPlanFiles,
          currentPlanIndex: 2,
          completedPlans: ['plans/plan-1.md', 'plans/plan-2.md'],
        };
        const progress = getProgress(implState);

        expect(progress.totalPlans).toBe(3);
        expect(progress.completedPlans).toBe(2);
        expect(progress.percentComplete).toBe(67);
      });
    });

    describe('isTerminalState', () => {
      it('should return true for completed', () => {
        const state = {
          phase: 'completed' as const,
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          completedAt: '2026-01-25T13:00:00Z',
          planFiles: mockPlanFiles,
          completedPlans: mockPlanFiles,
          prNumber: 123,
          prUrl: 'https://github.com/repo/pull/123',
        };

        expect(isTerminalState(state)).toBe(true);
      });

      it('should return true for failed', () => {
        const state = {
          phase: 'failed' as const,
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          failedAt: '2026-01-25T13:00:00Z',
          error: 'Test error',
          previousPhase: 'implementing' as const,
        };

        expect(isTerminalState(state)).toBe(true);
      });

      it('should return false for implementing', () => {
        const implState: ImplementingState = {
          phase: 'implementing',
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          planFiles: mockPlanFiles,
          currentPlanIndex: 0,
          completedPlans: [],
        };

        expect(isTerminalState(implState)).toBe(false);
      });
    });

    describe('canRetry', () => {
      it('should return true when under max attempts', () => {
        const verifyState: VerifyingState = {
          phase: 'verifying',
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          planFiles: mockPlanFiles,
          completedPlans: mockPlanFiles,
          prNumber: 123,
          ciRunId: 456,
          ciAttempts: 2,
        };

        expect(canRetry(verifyState)).toBe(true);
      });

      it('should return false when at max attempts', () => {
        const verifyState: VerifyingState = {
          phase: 'verifying',
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          planFiles: mockPlanFiles,
          completedPlans: mockPlanFiles,
          prNumber: 123,
          ciRunId: 456,
          ciAttempts: 3,
        };

        expect(canRetry(verifyState)).toBe(false);
      });

      it('should return false for non-verifying phases', () => {
        const implState: ImplementingState = {
          phase: 'implementing',
          config: mockConfig,
          startedAt: '2026-01-25T12:00:00Z',
          planFiles: mockPlanFiles,
          currentPlanIndex: 0,
          completedPlans: [],
        };

        expect(canRetry(implState)).toBe(false);
      });
    });
  });
});
