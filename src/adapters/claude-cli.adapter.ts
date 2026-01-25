/**
 * Claude CLI Adapter - Real implementation using `claude` CLI
 *
 * Implements IClaudeClient interface using Claude Code CLI for all operations.
 * Supports streaming responses for real-time output.
 */

import { execa, type Options as ExecaOptions, type ExecaChildProcess } from 'execa';
import type {
  IClaudeClient,
  ClaudeRunOptions,
  ClaudeResponse,
  ClaudeStreamChunk,
  ClaudeSession,
} from '../ports/claude.port';

export interface ClaudeCLIAdapterOptions {
  cwd?: string;
  timeout?: number;
}

interface ClaudeAPIResponse {
  content: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

function mapStopReason(
  reason: string
): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' {
  const reasonMap: Record<string, 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use'> = {
    end_turn: 'end_turn',
    max_tokens: 'max_tokens',
    stop_sequence: 'stop_sequence',
    tool_use: 'tool_use',
  };
  return reasonMap[reason] ?? 'end_turn';
}

export class ClaudeCLIAdapter implements IClaudeClient {
  private cwd: string;
  private timeout: number;

  constructor(options: ClaudeCLIAdapterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.timeout = options.timeout ?? 300000; // 5 minutes default for AI operations
  }

  private buildArgs(options: ClaudeRunOptions): string[] {
    const args: string[] = ['--print'];

    if (options.systemPrompt) {
      args.push('--system', options.systemPrompt);
    }

    if (options.maxTokens) {
      args.push('--max-tokens', options.maxTokens.toString());
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    // Add prompt as the last positional argument
    args.push(options.prompt);

    return args;
  }

  async runPrompt(options: ClaudeRunOptions): Promise<ClaudeResponse> {
    const args = this.buildArgs(options);
    const execaOptions: ExecaOptions = {
      cwd: options.workingDirectory ?? this.cwd,
      timeout: options.timeout ?? this.timeout,
    };

    const result = await execa('claude', args, execaOptions);

    // Claude CLI with --print outputs the response directly
    // For JSON output, we'd need --output-format json
    return {
      content: result.stdout,
      stopReason: 'end_turn',
      usage: {
        inputTokens: 0, // CLI doesn't expose token counts
        outputTokens: 0,
      },
    };
  }

  async *streamPrompt(
    options: ClaudeRunOptions
  ): AsyncGenerator<ClaudeStreamChunk, ClaudeResponse, unknown> {
    const args = this.buildArgs(options);
    const execaOptions: ExecaOptions = {
      cwd: options.workingDirectory ?? this.cwd,
      timeout: options.timeout ?? this.timeout,
    };

    const subprocess = execa('claude', args, execaOptions);
    let fullContent = '';

    if (subprocess.stdout) {
      const reader = subprocess.stdout[Symbol.asyncIterator]();

      for await (const chunk of reader) {
        const text = chunk.toString();
        fullContent += text;

        yield {
          type: 'text',
          content: fullContent,
          delta: text,
        };
      }
    }

    await subprocess;

    return {
      content: fullContent,
      stopReason: 'end_turn',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }

  async continueSession(sessionId: string, prompt: string): Promise<ClaudeResponse> {
    const args = ['--continue', sessionId, '--print', prompt];
    const execaOptions: ExecaOptions = {
      cwd: this.cwd,
      timeout: this.timeout,
    };

    const result = await execa('claude', args, execaOptions);

    return {
      content: result.stdout,
      stopReason: 'end_turn',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }

  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    // Claude CLI doesn't have a direct "list session" command
    // We'd need to read from ~/.claude/sessions/ or similar
    // For now, return a minimal session structure
    return {
      id: sessionId,
      createdAt: new Date().toISOString(),
      messages: [],
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execa('claude', ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string> {
    try {
      const result = await execa('claude', ['--version'], { timeout: 5000 });
      // Parse version from output like "claude 1.0.0" or similar
      const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
      return match?.[1] ?? result.stdout.trim();
    } catch {
      return 'unknown';
    }
  }
}
