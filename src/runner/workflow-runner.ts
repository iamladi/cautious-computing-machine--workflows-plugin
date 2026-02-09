/**
 * Main orchestration loop for the workflow
 *
 * This runner holds the XState actor and iterates through phases,
 * spawning fresh Claude CLI subprocesses for each phase.
 */

import { createActor } from 'xstate';
import { ClaudeCLIAdapter } from '../adapters/claude-cli-adapter';
import { ProgressWriter } from './progress-writer';
import { parseSignals, extractSignalData } from './signal-parser';
import {
  mapPhaseToCommand,
  formatCommand,
  isTerminalPhase,
  isSuccessPhase,
  getPhaseName,
} from './phase-mapper';
import {
  workflowMachine,
  getCurrentPhase,
  isTerminal,
  isSuccess,
} from '../workflows/main.workflow';
import type {
  WorkflowResult,
  WorkflowContext,
  WorkflowPhase,
  WorkflowEvent,
} from '../types';

const MAX_ITERATIONS = 50;
const PHASE_TIMEOUT = 15 * 60 * 1000; // 15 minutes per phase

interface RunnerOptions {
  claudePath?: string;
  maxIterations?: number;
  phaseTimeout?: number;
  verbose?: boolean;
}

export class WorkflowRunner {
  private claude: ClaudeCLIAdapter;
  private progressWriter: ProgressWriter;
  private maxIterations: number;
  private phaseTimeout: number;
  private verbose: boolean;

  constructor(options: RunnerOptions = {}) {
    this.claude = new ClaudeCLIAdapter(options.claudePath);
    this.progressWriter = new ProgressWriter();
    this.maxIterations = options.maxIterations ?? MAX_ITERATIONS;
    this.phaseTimeout = options.phaseTimeout ?? PHASE_TIMEOUT;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Run the full workflow from research file to completed PR
   */
  async run(researchFile: string): Promise<WorkflowResult> {
    this.log(`Starting workflow for: ${researchFile}`);

    // Create and start the XState actor
    const actor = createActor(workflowMachine);
    actor.start();

    // Send the start event
    actor.send({ type: 'START', researchFile });

    let iteration = 0;

    // Main orchestration loop
    while (iteration < this.maxIterations) {
      const snapshot = actor.getSnapshot();
      const stateValue = snapshot.value as string;
      const context = snapshot.context;

      // Check if we've reached a terminal state
      if (isTerminal(stateValue)) {
        this.log(`Workflow reached terminal state: ${stateValue}`);
        break;
      }

      const phase = getCurrentPhase(stateValue);
      this.log(`[${iteration + 1}] Phase: ${getPhaseName(phase)}`);

      // Get the command for this phase
      const phaseCommand = mapPhaseToCommand(phase, context);
      if (!phaseCommand) {
        this.log(`No command for phase: ${phase}, skipping`);
        iteration++;
        continue;
      }

      const command = formatCommand(phaseCommand);
      this.log(`Executing: ${command}`);

      // Execute the phase command in a fresh Claude CLI subprocess
      try {
        const result = await this.claude.runPrompt({
          prompt: command,
          workingDirectory: context.worktreePath ?? undefined,
          timeout: this.phaseTimeout,
        });

        this.logVerbose(`Output: ${result.content.slice(0, 500)}...`);

        // Parse signals from the output
        const event = parseSignals(result.content);
        if (event) {
          // Extract additional data for certain signals
          if (event.type !== 'FAIL') {
            const data = extractSignalData(result.content, event.type);
            event.data = { ...event.data, ...data };
          }

          this.log(`Signal received: ${event.type}`);
          actor.send(event as WorkflowEvent);
        } else {
          this.log('No signal received from phase, retrying...');
          // If no signal, we might need to retry or handle error
          // For now, continue to next iteration
        }

        // Update progress file
        const newSnapshot = actor.getSnapshot();
        await this.progressWriter.write(
          newSnapshot.context,
          getCurrentPhase(newSnapshot.value as string),
          iteration + 1
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        this.log(`Phase execution failed: ${errorMessage}`);

        actor.send({
          type: 'FAIL',
          error: errorMessage,
        } as WorkflowEvent);
      }

      iteration++;
    }

    // Get final state
    const finalSnapshot = actor.getSnapshot();
    const finalState = finalSnapshot.value as string;
    const finalContext = finalSnapshot.context;

    // Write final progress
    await this.progressWriter.write(
      finalContext,
      getCurrentPhase(finalState),
      iteration
    );

    const success = isSuccess(finalState);

    if (success) {
      this.log('Workflow completed successfully!');
    } else {
      this.log(`Workflow ended in state: ${finalState}`);
      if (finalContext.error) {
        this.log(`Error: ${finalContext.error}`);
      }
    }

    return {
      success,
      context: finalContext,
      finalPhase: finalState as WorkflowPhase,
    };
  }

  /**
   * Resume a workflow from existing progress file
   */
  async resume(): Promise<WorkflowResult> {
    const progressData = await this.progressWriter.read();

    if (!progressData) {
      throw new Error(
        'No workflow in progress. Start with: /workflows:build <research-file>'
      );
    }

    this.log(`Resuming workflow from phase: ${progressData.currentPhase}`);

    // Reconstruct context from progress data
    const context: WorkflowContext = {
      researchFile: progressData.researchFile,
      worktreePath: progressData.worktreePath,
      branch: progressData.branch,
      plans: progressData.plans.list,
      currentPlanIndex: progressData.plans.list.findIndex((p) => !p.completed),
      prNumber: progressData.pr.number,
      prUrl: progressData.pr.url,
      ciAttempts: progressData.pr.ciAttempts,
      commentAttempts: 0,
      error: null,
      startedAt: progressData.startedAt,
      lastUpdate: progressData.lastUpdate,
      signals: progressData.signals,
    };

    // For resume, we continue from where we left off
    return this.run(context.researchFile);
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] ${message}`);
  }

  private logVerbose(message: string): void {
    if (this.verbose) {
      this.log(message);
    }
  }
}
