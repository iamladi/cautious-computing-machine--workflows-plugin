#!/usr/bin/env bun
/**
 * CLI entry point for the workflow runner
 *
 * Usage:
 *   bun run src/cli.ts run <research-file>
 *   bun run src/cli.ts resume
 */

import { WorkflowRunner } from './runner/workflow-runner';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    printUsage();
    process.exit(1);
  }

  const runner = new WorkflowRunner({
    verbose: args.includes('--verbose') || args.includes('-v'),
  });

  switch (command) {
    case 'run': {
      const researchFile = args.find((a) => !a.startsWith('-'));
      if (!researchFile) {
        console.error('Error: Research file path required');
        console.error('Usage: cli.ts run <research-file>');
        process.exit(1);
      }

      const result = await runner.run(researchFile);
      outputResult(result);
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'resume': {
      try {
        const result = await runner.resume();
        outputResult(result);
        process.exit(result.success ? 0 : 1);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Error: ${message}`);
        process.exit(1);
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

function printUsage(): void {
  console.log(`
Workflow Runner CLI

Commands:
  run <research-file>   Start a new workflow from research file
  resume                Resume an existing workflow from progress file
  help                  Show this help message

Options:
  --verbose, -v         Enable verbose output

Examples:
  bun run src/cli.ts run research/my-feature.md
  bun run src/cli.ts run research/auth-system.md --verbose
  bun run src/cli.ts resume
`);
}

interface WorkflowResult {
  success: boolean;
  context: {
    prUrl: string | null;
    error: string | null;
    signals: Array<{ signal: string; timestamp: string }>;
  };
  finalPhase: string;
}

function outputResult(result: WorkflowResult): void {
  console.log('');
  console.log('═'.repeat(50));

  if (result.success) {
    console.log('<promise>COMPLETE</promise>');
    console.log(`final_phase: ${result.finalPhase}`);
    if (result.context.prUrl) {
      console.log(`pr_url: ${result.context.prUrl}`);
    }
  } else {
    console.log('<promise>FAILED</promise>');
    console.log(`final_phase: ${result.finalPhase}`);
    if (result.context.error) {
      console.log(`<error>${result.context.error}</error>`);
    }
  }

  console.log('═'.repeat(50));

  // Summary of signals
  console.log('\nSignal History:');
  for (const signal of result.context.signals) {
    console.log(`  ${signal.timestamp}: ${signal.signal}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
