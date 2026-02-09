/**
 * workflows-plugin - TypeScript runner infrastructure
 *
 * Main exports for programmatic usage
 */

// Core types
export type {
  WorkflowPhase,
  WorkflowSignal,
  WorkflowContext,
  WorkflowEvent,
  WorkflowResult,
  PlanInfo,
  SignalRecord,
  ClaudeRunOptions,
  ClaudeRunResult,
  ProgressFileData,
} from './types';

// Runner
export { WorkflowRunner } from './runner/workflow-runner';
export { parseSignals, parseAllSignals, extractSignalData } from './runner/signal-parser';
export { ProgressWriter } from './runner/progress-writer';
export {
  mapPhaseToCommand,
  formatCommand,
  getPhaseName,
  isTerminalPhase,
  isSuccessPhase,
} from './runner/phase-mapper';

// Workflow machine
export {
  workflowMachine,
  getCurrentPhase,
  isTerminal,
  isSuccess,
} from './workflows/main.workflow';

// Adapters
export { ClaudeCLIAdapter } from './adapters/claude-cli-adapter';
