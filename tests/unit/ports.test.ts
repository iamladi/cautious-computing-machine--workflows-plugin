import { describe, it, expect } from 'vitest';
import type { IGitHubClient, IClaudeClient, IProcessRunner } from '../../src/ports';

describe('Ports', () => {
  describe('IGitHubClient', () => {
    it('should define the required interface shape', () => {
      const mockClient: IGitHubClient = {
        getCIStatus: async () => ({
          id: 1,
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          headSha: 'abc123',
          headBranch: 'main',
          event: 'push',
          createdAt: '2026-01-25T00:00:00Z',
          updatedAt: '2026-01-25T00:00:00Z',
          url: 'https://github.com/test/repo/actions/runs/1',
          jobs: [],
        }),
        listCIRuns: async () => [],
        pollUntilComplete: async function* () {
          yield {
            id: 1,
            name: 'CI',
            status: 'completed' as const,
            conclusion: 'success' as const,
            headSha: 'abc123',
            headBranch: 'main',
            event: 'push',
            createdAt: '2026-01-25T00:00:00Z',
            updatedAt: '2026-01-25T00:00:00Z',
            url: 'https://github.com/test/repo/actions/runs/1',
            jobs: [],
          };
          return {
            id: 1,
            name: 'CI',
            status: 'completed' as const,
            conclusion: 'success' as const,
            headSha: 'abc123',
            headBranch: 'main',
            event: 'push',
            createdAt: '2026-01-25T00:00:00Z',
            updatedAt: '2026-01-25T00:00:00Z',
            url: 'https://github.com/test/repo/actions/runs/1',
            jobs: [],
          };
        },
        getComments: async () => [],
        postComment: async () => ({
          id: 1,
          body: 'test',
          author: 'bot',
          createdAt: '2026-01-25T00:00:00Z',
          updatedAt: '2026-01-25T00:00:00Z',
        }),
        replyToComment: async () => ({
          id: 2,
          body: 'reply',
          author: 'bot',
          createdAt: '2026-01-25T00:00:00Z',
          updatedAt: '2026-01-25T00:00:00Z',
        }),
        getPullRequest: async () => ({
          number: 1,
          title: 'Test PR',
          body: 'Description',
          state: 'open',
          headRef: 'feature',
          baseRef: 'main',
          url: 'https://github.com/test/repo/pull/1',
        }),
        getCurrentBranch: async () => 'main',
        getJobLogs: async () => 'logs...',
      };

      expect(mockClient).toBeDefined();
      expect(typeof mockClient.getCIStatus).toBe('function');
      expect(typeof mockClient.listCIRuns).toBe('function');
    });
  });

  describe('IClaudeClient', () => {
    it('should define the required interface shape', () => {
      const mockClient: IClaudeClient = {
        runPrompt: async () => ({
          content: 'response',
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: 20 },
        }),
        streamPrompt: async function* () {
          yield { type: 'text', content: 'chunk' };
          return {
            content: 'full response',
            stopReason: 'end_turn' as const,
            usage: { inputTokens: 10, outputTokens: 20 },
          };
        },
        continueSession: async () => ({
          content: 'continued',
          stopReason: 'end_turn',
          usage: { inputTokens: 5, outputTokens: 10 },
        }),
        resumeSession: async () => ({
          id: 'session-1',
          createdAt: '2026-01-25T00:00:00Z',
          messages: [],
        }),
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
      };

      expect(mockClient).toBeDefined();
      expect(typeof mockClient.runPrompt).toBe('function');
      expect(typeof mockClient.streamPrompt).toBe('function');
    });
  });

  describe('IProcessRunner', () => {
    it('should define the required interface shape', () => {
      const mockRunner: IProcessRunner = {
        run: async () => ({
          stdout: 'output',
          stderr: '',
          exitCode: 0,
          timedOut: false,
          killed: false,
        }),
        spawn: () => ({
          pid: 1234,
          stdout: (async function* () {
            yield 'chunk';
          })(),
          stderr: (async function* () {})(),
          kill: () => {},
          wait: async () => ({
            stdout: 'output',
            stderr: '',
            exitCode: 0,
            timedOut: false,
            killed: false,
          }),
        }),
        commandExists: async () => true,
        getCwd: () => '/home/user',
        setCwd: () => {},
      };

      expect(mockRunner).toBeDefined();
      expect(typeof mockRunner.run).toBe('function');
      expect(typeof mockRunner.spawn).toBe('function');
    });
  });
});
