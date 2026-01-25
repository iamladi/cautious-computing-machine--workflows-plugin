/**
 * CI Poller Service - Poll CI status until completion
 *
 * Handles CI status polling with configurable intervals and timeouts.
 */

import type { IGitHubClient, CIRunDetails, CIStatus } from '../ports';

export interface PollConfig {
  intervalMs: number;
  timeoutMs: number;
  onPoll?: (status: CIRunDetails) => void;
}

export const DEFAULT_POLL_CONFIG: PollConfig = {
  intervalMs: 30000, // 30 seconds
  timeoutMs: 1800000, // 30 minutes
};

export type PollResult =
  | { status: 'completed'; conclusion: 'success' | 'failure'; details: CIRunDetails }
  | { status: 'timeout'; lastDetails: CIRunDetails | null }
  | { status: 'error'; error: Error };

/**
 * Check if CI status is terminal (completed)
 */
export function isCIComplete(status: CIStatus): boolean {
  return status === 'completed';
}

/**
 * Check if CI conclusion indicates success
 */
export function isCISuccess(details: CIRunDetails): boolean {
  return details.status === 'completed' && details.conclusion === 'success';
}

/**
 * Check if CI conclusion indicates failure
 */
export function isCIFailure(details: CIRunDetails): boolean {
  return (
    details.status === 'completed' &&
    (details.conclusion === 'failure' ||
      details.conclusion === 'timed_out' ||
      details.conclusion === 'cancelled')
  );
}

/**
 * Poll CI status until completion or timeout
 */
export async function pollCIStatus(
  client: IGitHubClient,
  runId: number,
  config: PollConfig = DEFAULT_POLL_CONFIG
): Promise<PollResult> {
  const startTime = Date.now();
  let lastDetails: CIRunDetails | null = null;

  try {
    while (true) {
      const details = await client.getCIStatus(runId);
      lastDetails = details;

      if (config.onPoll) {
        config.onPoll(details);
      }

      if (isCIComplete(details.status)) {
        return {
          status: 'completed',
          conclusion: isCISuccess(details) ? 'success' : 'failure',
          details,
        };
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= config.timeoutMs) {
        return {
          status: 'timeout',
          lastDetails,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
    }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Create a CI poller generator for fine-grained control
 */
export async function* createCIPoller(
  client: IGitHubClient,
  runId: number,
  config: PollConfig = DEFAULT_POLL_CONFIG
): AsyncGenerator<CIRunDetails, PollResult, void> {
  const startTime = Date.now();

  while (true) {
    let details: CIRunDetails;

    try {
      details = await client.getCIStatus(runId);
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }

    yield details;

    if (isCIComplete(details.status)) {
      return {
        status: 'completed',
        conclusion: isCISuccess(details) ? 'success' : 'failure',
        details,
      };
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= config.timeoutMs) {
      return {
        status: 'timeout',
        lastDetails: details,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }
}

/**
 * Wait for CI with progress callback
 */
export async function waitForCI(
  client: IGitHubClient,
  runId: number,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (details: CIRunDetails, elapsedMs: number) => void;
  } = {}
): Promise<PollResult> {
  const config: PollConfig = {
    intervalMs: options.intervalMs ?? DEFAULT_POLL_CONFIG.intervalMs,
    timeoutMs: options.timeoutMs ?? DEFAULT_POLL_CONFIG.timeoutMs,
  };

  const startTime = Date.now();

  return pollCIStatus(client, runId, {
    ...config,
    onPoll: options.onProgress
      ? (details) => options.onProgress!(details, Date.now() - startTime)
      : undefined,
  });
}

/**
 * Get human-readable CI status message
 */
export function getCIStatusMessage(details: CIRunDetails): string {
  if (details.status === 'queued') {
    return 'CI is queued, waiting to start...';
  }

  if (details.status === 'in_progress') {
    const jobsInProgress = details.jobs.filter((j) => j.status === 'in_progress');
    if (jobsInProgress.length > 0) {
      return `Running: ${jobsInProgress.map((j) => j.name).join(', ')}`;
    }
    return 'CI is running...';
  }

  if (details.status === 'completed') {
    if (details.conclusion === 'success') {
      return 'CI passed successfully';
    }
    if (details.conclusion === 'failure') {
      const failedJobs = details.jobs.filter((j) => j.conclusion === 'failure');
      if (failedJobs.length > 0) {
        return `CI failed: ${failedJobs.map((j) => j.name).join(', ')}`;
      }
      return 'CI failed';
    }
    return `CI completed with: ${details.conclusion}`;
  }

  return `CI status: ${details.status}`;
}
