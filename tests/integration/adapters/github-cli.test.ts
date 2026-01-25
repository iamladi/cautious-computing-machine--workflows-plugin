/**
 * GitHub CLI Adapter Integration Tests
 *
 * These tests run against the real `gh` CLI.
 * They are skipped in CI or when gh is not available.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execa } from 'execa';
import { GitHubCLIAdapter } from '../../../src/adapters/github-cli.adapter';

// Skip tests if gh CLI is not available or not authenticated
async function isGHAvailable(): Promise<boolean> {
  try {
    await execa('gh', ['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}

describe('GitHubCLIAdapter Integration', () => {
  let adapter: GitHubCLIAdapter;
  let ghAvailable: boolean;

  beforeAll(async () => {
    ghAvailable = await isGHAvailable();
    adapter = new GitHubCLIAdapter({
      cwd: process.cwd(),
      timeout: 30000,
    });
  });

  describe('when gh CLI is available', () => {
    it.skipIf(!ghAvailable)('should get current branch', async () => {
      const branch = await adapter.getCurrentBranch();
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });

    // Note: These tests require being in a GitHub repo
    // They will fail gracefully if not in a repo

    it.skipIf(!ghAvailable)('should list CI runs (may be empty)', async () => {
      try {
        const runs = await adapter.listCIRuns(undefined, 5);
        expect(Array.isArray(runs)).toBe(true);
        // Verify structure if runs exist
        if (runs.length > 0) {
          const run = runs[0]!;
          expect(run).toHaveProperty('id');
          expect(run).toHaveProperty('name');
          expect(run).toHaveProperty('status');
        }
      } catch (error) {
        // Expected if not in a GitHub repo
        expect(String(error)).toMatch(/no repo|not found|authentication/i);
      }
    });
  });

  describe('adapter structure', () => {
    it('should implement IGitHubClient interface', () => {
      expect(typeof adapter.getCIStatus).toBe('function');
      expect(typeof adapter.listCIRuns).toBe('function');
      expect(typeof adapter.pollUntilComplete).toBe('function');
      expect(typeof adapter.getComments).toBe('function');
      expect(typeof adapter.postComment).toBe('function');
      expect(typeof adapter.replyToComment).toBe('function');
      expect(typeof adapter.getPullRequest).toBe('function');
      expect(typeof adapter.getCurrentBranch).toBe('function');
      expect(typeof adapter.getJobLogs).toBe('function');
    });

    it('should accept configuration options', () => {
      const customAdapter = new GitHubCLIAdapter({
        cwd: '/tmp',
        timeout: 60000,
      });
      expect(customAdapter).toBeInstanceOf(GitHubCLIAdapter);
    });
  });
});
