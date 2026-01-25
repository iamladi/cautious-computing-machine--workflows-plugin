/**
 * Mock Adapters - Test implementations for Hexagonal Architecture ports
 */

export { MockGitHubClient, type MockGitHubClientOptions } from './mock-github';
export { MockClaudeClient, type MockClaudeClientOptions } from './mock-claude';
export { MockProcessRunner, type MockCommand, type MockProcessRunnerOptions } from './mock-process';
