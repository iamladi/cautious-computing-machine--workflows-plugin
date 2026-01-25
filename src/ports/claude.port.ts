/**
 * Claude Port - Interface for Claude CLI interactions
 *
 * Following Hexagonal Architecture, this port defines the contract
 * for AI interactions without specifying implementation details.
 */

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: string;
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ClaudeStreamChunk {
  type: 'text' | 'tool_use' | 'error';
  content: string;
  delta?: string;
}

export interface ClaudeRunOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  allowedTools?: string[];
  workingDirectory?: string;
  timeout?: number;
}

export interface ClaudeSession {
  id: string;
  createdAt: string;
  messages: ClaudeMessage[];
}

export interface IClaudeClient {
  /**
   * Run a prompt and get the full response
   */
  runPrompt(options: ClaudeRunOptions): Promise<ClaudeResponse>;

  /**
   * Run a prompt and stream the response
   */
  streamPrompt(options: ClaudeRunOptions): AsyncGenerator<ClaudeStreamChunk, ClaudeResponse, unknown>;

  /**
   * Continue an existing session
   */
  continueSession(sessionId: string, prompt: string): Promise<ClaudeResponse>;

  /**
   * Resume a session from a previous run
   */
  resumeSession(sessionId: string): Promise<ClaudeSession>;

  /**
   * Check if Claude CLI is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get Claude CLI version
   */
  getVersion(): Promise<string>;
}
