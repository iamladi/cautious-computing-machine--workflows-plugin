/**
 * Workflows Plugin - TDD-Enabled TypeScript Architecture
 *
 * Public API for workflow orchestration.
 */

// Core - Pure functions (Functional Core)
export * from './core/workflow-state';
export * from './core/error-detector';
export * from './core/phase-manager';

// Ports - Interfaces (Hexagonal Architecture)
export * from './ports';

// Adapters - Implementations (Imperative Shell)
export * from './adapters';

// Workflows - XState orchestration
export * from './workflows/main.workflow';

// Services
export * from './services/retry.service';
export * from './services/ci-poller.service';

// Re-export types for convenience
export type { IGitHubClient, IClaudeClient, IProcessRunner } from './ports';
export type { WorkflowContext, WorkflowEvent } from './workflows/main.workflow';
