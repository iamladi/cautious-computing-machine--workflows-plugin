# Build Workflow

Autonomous workflow orchestration from research file to merge-ready PR.

## Arguments

- `$ARGUMENTS` - Path to research file (e.g., `research/my-feature.md`)
- `--continue` - Resume from last checkpoint

## Overview

This command spawns the TypeScript workflow runner which handles all phases autonomously:

1. **Setup** - Create worktree, initialize progress
2. **Planning** - Split research into implementation plans
3. **Implementation** - Execute each plan sequentially
4. **Submission** - Create and push PR
5. **CI Resolution** - Monitor and fix CI failures
6. **Comment Resolution** - Address reviewer feedback

Each phase runs in a **separate Claude CLI subprocess** with fresh context.

## Implementation

### Spawn TypeScript Runner

The workflow runner is implemented in TypeScript with XState for state management.

```bash
# Get plugin directory (where this command lives)
PLUGIN_DIR="$(dirname "$(dirname "$0")")"

# Run the CLI
bun run --cwd "$PLUGIN_DIR" src/cli.ts run "$ARGUMENTS"
```

### For Resume Mode

```bash
bun run --cwd "$PLUGIN_DIR" src/cli.ts resume
```

## What the Runner Does

The TypeScript runner (`src/runner/workflow-runner.ts`):

1. Creates an XState actor with the workflow state machine
2. Sends `START` event with research file path
3. Enters main loop:
   - Get current phase from XState snapshot
   - Map phase to slash command (e.g., `setup` → `/workflows:phase-setup`)
   - Spawn fresh Claude CLI subprocess with command
   - Parse output for XML signals (`<phase>SIGNAL</phase>`)
   - Send event to XState actor
   - Update progress file
   - Repeat until terminal state

4. On completion:
   - Emit `<promise>COMPLETE</promise>` with PR URL
   - Or `<promise>FAILED</promise>` with error

## Progress Tracking

State is persisted to `.workflow-progress.txt` for:
- Visibility into current progress
- Resume capability after interruptions
- External script coordination

## Phase Commands

Each phase is a separate command for fresh context:
- `/workflows:phase-setup` - Create worktree
- `/workflows:phase-plan` - Generate plans
- `/workflows:phase-impl` - Execute single plan
- `/workflows:phase-submit` - Create PR
- `/workflows:phase-verify-ci` - Check CI status
- `/workflows:phase-fix-ci` - Fix CI failures
- `/workflows:phase-resolve-comments` - Handle review comments

## Output

### Success

```
<promise>COMPLETE</promise>
PR: https://github.com/org/repo/pull/123

Phases completed:
- Setup: ✓
- Planning: ✓ (3 plans)
- Implementation: ✓
- Submission: ✓
- CI Resolution: ✓
- Comment Resolution: ✓

Time elapsed: 45m 23s
```

### Failure

```
<promise>FAILED</promise>
<error>CI failed after 5 attempts</error>

Final phase: ci_resolution
Last signal: CI_FAILED

See .workflow-progress.txt for details.
```

## Example Usage

### Start New Workflow

```
/workflows:build research/my-feature.md
```

### Resume Interrupted Workflow

```
/workflows:build --continue
```

### With Verbose Output

```
/workflows:build research/my-feature.md --verbose
```
