/**
 * Map XState phases to slash commands
 */

import type { WorkflowPhase, WorkflowContext } from '../types';

interface PhaseCommand {
  command: string;
  args: string[];
}

/**
 * Map current workflow phase to the appropriate slash command
 */
export function mapPhaseToCommand(
  phase: WorkflowPhase,
  context: WorkflowContext
): PhaseCommand | null {
  switch (phase) {
    case 'setup':
      return {
        command: '/workflows:phase-setup',
        args: [context.researchFile],
      };

    case 'planning':
      return {
        command: '/workflows:phase-plan',
        args: [context.researchFile],
      };

    case 'implementing': {
      const currentPlan = context.plans[context.currentPlanIndex];
      if (!currentPlan) {
        return null;
      }
      return {
        command: '/workflows:phase-impl',
        args: [currentPlan.path],
      };
    }

    case 'submitting':
      return {
        command: '/workflows:phase-submit',
        args: [],
      };

    case 'ci_resolution':
      return {
        command: '/workflows:phase-verify-ci',
        args: context.prNumber ? [String(context.prNumber)] : [],
      };

    case 'ci_fixing':
      return {
        command: '/workflows:phase-fix-ci',
        args: context.prNumber ? [String(context.prNumber)] : [],
      };

    case 'comment_resolution':
      return {
        command: '/workflows:phase-resolve-comments',
        args: context.prNumber ? [String(context.prNumber)] : [],
      };

    case 'comment_resolving':
      // Same command as resolution - it handles the fixing
      return {
        command: '/workflows:phase-resolve-comments',
        args: context.prNumber ? [String(context.prNumber)] : [],
      };

    case 'idle':
    case 'completed':
    case 'failed':
      return null;

    default:
      return null;
  }
}

/**
 * Format command with arguments for Claude CLI
 */
export function formatCommand(phaseCommand: PhaseCommand): string {
  const { command, args } = phaseCommand;
  if (args.length === 0) {
    return command;
  }
  return `${command} ${args.join(' ')}`;
}

/**
 * Get human-readable phase name
 */
export function getPhaseName(phase: WorkflowPhase): string {
  const names: Record<WorkflowPhase, string> = {
    idle: 'Idle',
    setup: 'Setup',
    planning: 'Planning',
    implementing: 'Implementing',
    submitting: 'Submitting PR',
    ci_resolution: 'Verifying CI',
    ci_fixing: 'Fixing CI',
    comment_resolution: 'Resolving Comments',
    comment_resolving: 'Applying Comment Fixes',
    completed: 'Completed',
    failed: 'Failed',
  };
  return names[phase] ?? phase;
}

/**
 * Check if phase is a terminal state
 */
export function isTerminalPhase(phase: WorkflowPhase): boolean {
  return phase === 'completed' || phase === 'failed';
}

/**
 * Check if phase completed successfully
 */
export function isSuccessPhase(phase: WorkflowPhase): boolean {
  return phase === 'completed';
}
