/**
 * Mock Process Runner - Test adapter for IProcessRunner
 *
 * Provides controllable command execution for unit testing without
 * running real processes.
 */

import type {
  IProcessRunner,
  ProcessResult,
  SpawnOptions,
  StreamingProcess,
} from '../../ports/process.port';

export interface MockCommand {
  stdout: string;
  stderr: string;
  exitCode: number;
  delay?: number;
}

export interface MockProcessRunnerOptions {
  commands?: Map<string, MockCommand>;
  commandExists?: Set<string>;
  cwd?: string;
}

export class MockProcessRunner implements IProcessRunner {
  private commands: Map<string, MockCommand>;
  private existingCommands: Set<string>;
  private cwd: string;
  private runHistory: Array<{ command: string; args: string[]; options?: SpawnOptions }> = [];

  constructor(options: MockProcessRunnerOptions = {}) {
    this.commands = options.commands ?? new Map();
    this.existingCommands = options.commandExists ?? new Set(['gh', 'claude', 'git']);
    this.cwd = options.cwd ?? process.cwd();
  }

  private getCommandKey(command: string, args: string[]): string {
    return `${command} ${args.join(' ')}`;
  }

  async run(command: string, args: string[], options?: SpawnOptions): Promise<ProcessResult> {
    this.runHistory.push({ command, args, options });

    const key = this.getCommandKey(command, args);
    const mock = this.commands.get(key);

    if (mock) {
      if (mock.delay) {
        await new Promise((resolve) => setTimeout(resolve, mock.delay));
      }
      return {
        stdout: mock.stdout,
        stderr: mock.stderr,
        exitCode: mock.exitCode,
        timedOut: false,
        killed: false,
      };
    }

    // Default: command not found behavior
    return {
      stdout: '',
      stderr: `command not found: ${command}`,
      exitCode: 127,
      timedOut: false,
      killed: false,
    };
  }

  spawn(command: string, args: string[], options?: SpawnOptions): StreamingProcess {
    this.runHistory.push({ command, args, options });

    const key = this.getCommandKey(command, args);
    const mock = this.commands.get(key);

    let killed = false;

    const result: ProcessResult = mock
      ? {
          stdout: mock.stdout,
          stderr: mock.stderr,
          exitCode: mock.exitCode,
          timedOut: false,
          killed: false,
        }
      : {
          stdout: '',
          stderr: `command not found: ${command}`,
          exitCode: 127,
          timedOut: false,
          killed: false,
        };

    return {
      pid: Math.floor(Math.random() * 10000) + 1000,
      stdout: (async function* () {
        if (mock && !killed) {
          yield mock.stdout;
        }
      })(),
      stderr: (async function* () {
        if (mock && mock.stderr && !killed) {
          yield mock.stderr;
        }
      })(),
      kill: () => {
        killed = true;
      },
      wait: async () => ({
        ...result,
        killed,
      }),
    };
  }

  async commandExists(command: string): Promise<boolean> {
    return this.existingCommands.has(command);
  }

  getCwd(): string {
    return this.cwd;
  }

  setCwd(path: string): void {
    this.cwd = path;
  }

  // Test helpers
  setCommand(command: string, args: string[], result: MockCommand): void {
    const key = this.getCommandKey(command, args);
    this.commands.set(key, result);
  }

  setCommandExists(command: string, exists: boolean): void {
    if (exists) {
      this.existingCommands.add(command);
    } else {
      this.existingCommands.delete(command);
    }
  }

  getRunHistory(): Array<{ command: string; args: string[]; options?: SpawnOptions }> {
    return [...this.runHistory];
  }

  clearRunHistory(): void {
    this.runHistory = [];
  }
}
