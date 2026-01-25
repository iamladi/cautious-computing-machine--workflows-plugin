/**
 * Claude CLI Adapter Integration Tests
 *
 * These tests verify the adapter structure and basic functionality.
 * Full integration with Claude CLI is skipped unless CLAUDE_INTEGRATION=true.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeCLIAdapter } from '../../../src/adapters/claude-cli.adapter';

// Skip expensive Claude tests unless explicitly enabled
const runFullIntegration = process.env['CLAUDE_INTEGRATION'] === 'true';

describe('ClaudeCLIAdapter Integration', () => {
  let adapter: ClaudeCLIAdapter;

  beforeAll(() => {
    adapter = new ClaudeCLIAdapter({
      cwd: process.cwd(),
      timeout: 60000,
    });
  });

  describe('adapter structure', () => {
    it('should implement IClaudeClient interface', () => {
      expect(typeof adapter.runPrompt).toBe('function');
      expect(typeof adapter.streamPrompt).toBe('function');
      expect(typeof adapter.continueSession).toBe('function');
      expect(typeof adapter.resumeSession).toBe('function');
      expect(typeof adapter.isAvailable).toBe('function');
      expect(typeof adapter.getVersion).toBe('function');
    });

    it('should accept configuration options', () => {
      const customAdapter = new ClaudeCLIAdapter({
        cwd: '/tmp',
        timeout: 120000,
      });
      expect(customAdapter).toBeInstanceOf(ClaudeCLIAdapter);
    });
  });

  describe('availability check', () => {
    it('should check if claude CLI is available', async () => {
      const available = await adapter.isAvailable();
      // May be true or false depending on environment
      expect(typeof available).toBe('boolean');
    });

    it('should get version (or "unknown" if not available)', async () => {
      const version = await adapter.getVersion();
      expect(typeof version).toBe('string');
      // Either a version number or "unknown"
      expect(version.length).toBeGreaterThan(0);
    });
  });

  describe.skipIf(!runFullIntegration)('full integration', () => {
    it('should run a simple prompt', async () => {
      const response = await adapter.runPrompt({
        prompt: 'Say "hello" and nothing else.',
      });

      expect(response.content).toBeDefined();
      expect(response.stopReason).toBe('end_turn');
    });

    it('should stream a response', async () => {
      const chunks: string[] = [];

      const generator = adapter.streamPrompt({
        prompt: 'Count from 1 to 3, one number per line.',
      });

      for await (const chunk of generator) {
        if (chunk.delta) {
          chunks.push(chunk.delta);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('resumeSession', () => {
    it('should return minimal session structure', async () => {
      const session = await adapter.resumeSession('test-session-id');

      expect(session).toHaveProperty('id', 'test-session-id');
      expect(session).toHaveProperty('createdAt');
      expect(session).toHaveProperty('messages');
      expect(Array.isArray(session.messages)).toBe(true);
    });
  });
});
