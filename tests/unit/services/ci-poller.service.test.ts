import { describe, it, expect, vi } from 'vitest';
import {
  isCIComplete,
  isCISuccess,
  isCIFailure,
  pollCIStatus,
  getCIStatusMessage,
  DEFAULT_POLL_CONFIG,
  type PollConfig,
} from '../../../src/services/ci-poller.service';
import { MockGitHubClient } from '../../../src/adapters/mocks';
import type { CIRunDetails, CIStatus, CIConclusion } from '../../../src/ports';

function createMockDetails(
  status: CIStatus,
  conclusion: CIConclusion = null,
  jobs: CIRunDetails['jobs'] = []
): CIRunDetails {
  return {
    id: 123,
    name: 'CI',
    status,
    conclusion,
    headSha: 'abc123',
    headBranch: 'main',
    event: 'push',
    createdAt: '2026-01-25T00:00:00Z',
    updatedAt: '2026-01-25T00:00:00Z',
    url: 'https://github.com/test/repo/actions/runs/123',
    jobs,
  };
}

describe('CIPollerService', () => {
  describe('isCIComplete', () => {
    it('should return true for completed status', () => {
      expect(isCIComplete('completed')).toBe(true);
    });

    it('should return false for non-completed statuses', () => {
      expect(isCIComplete('queued')).toBe(false);
      expect(isCIComplete('in_progress')).toBe(false);
      expect(isCIComplete('action_required')).toBe(false);
    });
  });

  describe('isCISuccess', () => {
    it('should return true for completed + success', () => {
      const details = createMockDetails('completed', 'success');
      expect(isCISuccess(details)).toBe(true);
    });

    it('should return false for completed + failure', () => {
      const details = createMockDetails('completed', 'failure');
      expect(isCISuccess(details)).toBe(false);
    });

    it('should return false for in_progress', () => {
      const details = createMockDetails('in_progress', null);
      expect(isCISuccess(details)).toBe(false);
    });
  });

  describe('isCIFailure', () => {
    it('should return true for completed + failure', () => {
      const details = createMockDetails('completed', 'failure');
      expect(isCIFailure(details)).toBe(true);
    });

    it('should return true for completed + timed_out', () => {
      const details = createMockDetails('completed', 'timed_out');
      expect(isCIFailure(details)).toBe(true);
    });

    it('should return true for completed + cancelled', () => {
      const details = createMockDetails('completed', 'cancelled');
      expect(isCIFailure(details)).toBe(true);
    });

    it('should return false for completed + success', () => {
      const details = createMockDetails('completed', 'success');
      expect(isCIFailure(details)).toBe(false);
    });
  });

  describe('pollCIStatus', () => {
    it('should return immediately if CI is already complete', async () => {
      const client = new MockGitHubClient();
      client.setCIRunDetails(123, createMockDetails('completed', 'success'));

      const config: PollConfig = { ...DEFAULT_POLL_CONFIG, intervalMs: 10 };
      const result = await pollCIStatus(client, 123, config);

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.conclusion).toBe('success');
      }
    });

    it('should poll until completion', async () => {
      const client = new MockGitHubClient();
      let callCount = 0;

      // Override getCIStatus to simulate progress
      const originalGetCIStatus = client.getCIStatus.bind(client);
      client.getCIStatus = async (runId: number) => {
        callCount++;
        if (callCount < 3) {
          return createMockDetails('in_progress', null);
        }
        return createMockDetails('completed', 'success');
      };

      const config: PollConfig = { intervalMs: 10, timeoutMs: 5000 };
      const result = await pollCIStatus(client, 123, config);

      expect(result.status).toBe('completed');
      expect(callCount).toBe(3);
    });

    it('should timeout if CI never completes', async () => {
      const client = new MockGitHubClient();
      client.getCIStatus = async () => createMockDetails('in_progress', null);

      const config: PollConfig = { intervalMs: 10, timeoutMs: 50 };
      const result = await pollCIStatus(client, 123, config);

      expect(result.status).toBe('timeout');
      if (result.status === 'timeout') {
        expect(result.lastDetails).not.toBeNull();
      }
    });

    it('should call onPoll callback for each poll', async () => {
      const client = new MockGitHubClient();
      let callCount = 0;
      client.getCIStatus = async () => {
        callCount++;
        if (callCount < 2) {
          return createMockDetails('in_progress', null);
        }
        return createMockDetails('completed', 'success');
      };

      const onPoll = vi.fn();
      const config: PollConfig = { intervalMs: 10, timeoutMs: 5000, onPoll };

      await pollCIStatus(client, 123, config);

      expect(onPoll).toHaveBeenCalledTimes(2);
    });

    it('should return error if client throws', async () => {
      const client = new MockGitHubClient();
      client.getCIStatus = async () => {
        throw new Error('API error');
      };

      const config: PollConfig = { intervalMs: 10, timeoutMs: 1000 };
      const result = await pollCIStatus(client, 123, config);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.message).toBe('API error');
      }
    });
  });

  describe('getCIStatusMessage', () => {
    it('should return queued message', () => {
      const details = createMockDetails('queued', null);
      expect(getCIStatusMessage(details)).toContain('queued');
    });

    it('should return in_progress message with job names', () => {
      const details = createMockDetails('in_progress', null, [
        {
          id: 1,
          name: 'Build',
          status: 'in_progress',
          conclusion: null,
          steps: [],
        },
        {
          id: 2,
          name: 'Test',
          status: 'queued',
          conclusion: null,
          steps: [],
        },
      ]);
      const message = getCIStatusMessage(details);
      expect(message).toContain('Build');
      expect(message).not.toContain('Test'); // Test is queued, not in_progress
    });

    it('should return success message', () => {
      const details = createMockDetails('completed', 'success');
      expect(getCIStatusMessage(details)).toContain('passed');
    });

    it('should return failure message with failed job names', () => {
      const details = createMockDetails('completed', 'failure', [
        {
          id: 1,
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          steps: [],
        },
        {
          id: 2,
          name: 'Test',
          status: 'completed',
          conclusion: 'failure',
          steps: [],
        },
      ]);
      const message = getCIStatusMessage(details);
      expect(message).toContain('failed');
      expect(message).toContain('Test');
    });
  });
});
