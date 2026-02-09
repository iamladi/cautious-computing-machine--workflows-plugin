/**
 * Adapter for spawning Claude CLI subprocesses
 */

import { spawn } from 'node:child_process';
import type { ClaudeRunOptions, ClaudeRunResult } from '../types';

const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

export class ClaudeCLIAdapter {
  private claudePath: string;

  constructor(claudePath: string = 'claude') {
    this.claudePath = claudePath;
  }

  /**
   * Run a prompt through Claude CLI as a subprocess
   * Each invocation starts with fresh context
   */
  async runPrompt(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
    const { prompt, workingDirectory, timeout = DEFAULT_TIMEOUT } = options;

    return new Promise((resolve, reject) => {
      const args = ['-p', prompt, '--output-format', 'text'];

      const child = spawn(this.claudePath, args, {
        cwd: workingDirectory ?? process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Disable interactive features
          CI: 'true',
        },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Claude CLI timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          content: stdout,
          exitCode: code ?? 0,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  /**
   * Run a slash command through Claude CLI
   */
  async runCommand(
    command: string,
    options: Omit<ClaudeRunOptions, 'prompt'> = {}
  ): Promise<ClaudeRunResult> {
    return this.runPrompt({
      ...options,
      prompt: command,
    });
  }

  /**
   * Check if Claude CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.runPrompt({
        prompt: 'echo "test"',
        timeout: 5000,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
}
