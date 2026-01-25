/**
 * Process Port - Interface for process spawning and execution
 *
 * Following Hexagonal Architecture, this port defines the contract
 * for running external processes without specifying implementation details.
 */

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  timedOut: boolean;
  killed: boolean;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeout?: number;
  stdin?: string;
  shell?: boolean;
}

export interface StreamingProcess {
  pid: number;
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
  kill(signal?: string): void;
  wait(): Promise<ProcessResult>;
}

export interface IProcessRunner {
  /**
   * Run a command and wait for completion
   */
  run(command: string, args: string[], options?: SpawnOptions): Promise<ProcessResult>;

  /**
   * Spawn a command and return streaming handles
   */
  spawn(command: string, args: string[], options?: SpawnOptions): StreamingProcess;

  /**
   * Check if a command exists in PATH
   */
  commandExists(command: string): Promise<boolean>;

  /**
   * Get the current working directory
   */
  getCwd(): string;

  /**
   * Set the current working directory for subsequent commands
   */
  setCwd(path: string): void;
}
