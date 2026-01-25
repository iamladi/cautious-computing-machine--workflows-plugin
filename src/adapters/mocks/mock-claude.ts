/**
 * Mock Claude Client - Test adapter for IClaudeClient
 *
 * Provides controllable responses for unit testing without
 * calling the real Claude CLI.
 */

import type {
  IClaudeClient,
  ClaudeRunOptions,
  ClaudeResponse,
  ClaudeStreamChunk,
  ClaudeSession,
} from '../../ports/claude.port';

export interface MockClaudeClientOptions {
  responses?: Map<string, ClaudeResponse>;
  sessions?: Map<string, ClaudeSession>;
  isAvailable?: boolean;
  version?: string;
}

export class MockClaudeClient implements IClaudeClient {
  private responses: Map<string, ClaudeResponse>;
  private sessions: Map<string, ClaudeSession>;
  private available: boolean;
  private version: string;
  private defaultResponse: ClaudeResponse;
  private promptHistory: ClaudeRunOptions[] = [];

  constructor(options: MockClaudeClientOptions = {}) {
    this.responses = options.responses ?? new Map();
    this.sessions = options.sessions ?? new Map();
    this.available = options.isAvailable ?? true;
    this.version = options.version ?? '1.0.0-mock';
    this.defaultResponse = {
      content: 'Mock response',
      stopReason: 'end_turn',
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }

  async runPrompt(options: ClaudeRunOptions): Promise<ClaudeResponse> {
    this.promptHistory.push(options);
    const response = this.responses.get(options.prompt);
    return response ?? this.defaultResponse;
  }

  async *streamPrompt(
    options: ClaudeRunOptions
  ): AsyncGenerator<ClaudeStreamChunk, ClaudeResponse, unknown> {
    this.promptHistory.push(options);
    const response = this.responses.get(options.prompt) ?? this.defaultResponse;

    // Simulate streaming by yielding chunks
    const words = response.content.split(' ');
    for (const word of words) {
      yield {
        type: 'text',
        content: word + ' ',
        delta: word + ' ',
      };
    }

    return response;
  }

  async continueSession(sessionId: string, prompt: string): Promise<ClaudeResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Add the prompt to session history
    session.messages.push({ role: 'user', content: prompt });

    const response = this.responses.get(prompt) ?? this.defaultResponse;
    session.messages.push({ role: 'assistant', content: response.content });

    return response;
  }

  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async getVersion(): Promise<string> {
    return this.version;
  }

  // Test helpers
  setResponse(prompt: string, response: ClaudeResponse): void {
    this.responses.set(prompt, response);
  }

  setDefaultResponse(response: ClaudeResponse): void {
    this.defaultResponse = response;
  }

  setSession(sessionId: string, session: ClaudeSession): void {
    this.sessions.set(sessionId, session);
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setVersion(version: string): void {
    this.version = version;
  }

  getPromptHistory(): ClaudeRunOptions[] {
    return [...this.promptHistory];
  }

  clearPromptHistory(): void {
    this.promptHistory = [];
  }
}
