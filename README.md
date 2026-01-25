# Workflows Plugin

Autonomous workflow orchestration for the full SDLC pipeline - from research to PR submission.

## Overview

The workflows plugin automates the entire software development lifecycle by orchestrating existing SDLC, GitHub, and Primitives plugin commands into a single autonomous pipeline.

## Installation

Copy or symlink this plugin to your Claude Code plugins directory:

```bash
ln -s /path/to/workflows-plugin ~/.claude/plugins/workflows-plugin
```

## Commands

### `/build`

Orchestrate the full SDLC pipeline from research file to merged PR.

**Usage:**
```bash
# Start new workflow
/workflows:build research/my-feature.md

# Resume interrupted workflow
/workflows:build --continue
```

**Arguments:**
- `research-file` - Path to research file (e.g., `research/my-feature.md`)
- `--continue` - Resume from last checkpoint

### `/resolve-comments`

Address PR review comments autonomously.

**Usage:**
```bash
/workflows:resolve-comments <pr-number>
```

**Arguments:**
- `pr-number` - GitHub PR number to resolve comments for

## Workflow Phases

The build command executes four phases:

1. **Setup** - Create isolated worktree, initialize progress tracking
2. **Planning** - Generate implementation plans from research
3. **Implementation** - Execute each plan sequentially
4. **Submission** - Create and push PR

## Progress Tracking

The workflow maintains state in `.workflow-progress.txt` at the worktree root:

```
# Workflow Progress
# Generated: 2026-01-25T10:00:00Z
# Research: research/my-feature.md
# Worktree: .worktrees/feat/my-feature
# Branch: feat/my-feature

## Status
current_phase: IMPLEMENTATION
iteration: 1
started_at: 2026-01-25T10:00:00Z
last_update: 2026-01-25T10:15:00Z

## Plans
total: 3
completed: 1
- [x] plans/workflow-1-foundation.md (issue: #42)
- [ ] plans/workflow-2-core-logic.md (issue: #43) <- CURRENT
- [ ] plans/workflow-3-integration.md (issue: #44)

## PR
number: null
url: null
ci_status: pending
ci_attempts: 0
```

## Phase Signals

The workflow emits XML-style signals for external script coordination:

| Signal | Description |
|--------|-------------|
| `<phase>SETUP_COMPLETE</phase>` | Worktree created, dependencies installed |
| `<phase>PLANNING_COMPLETE</phase>` | Plans generated |
| `<phase>IMPLEMENTATION_COMPLETE</phase>` | All plans implemented |
| `<phase>SUBMISSION_COMPLETE</phase>` | PR created and pushed |
| `<phase>WORKFLOW_COMPLETE</phase>` | Entire workflow finished |
| `<phase>ERROR:{phase}:{message}</phase>` | Error during phase |

### External Script Integration

The signals follow the "Ralph pattern" for coordination with external shell scripts. An external script can:

1. Watch stdout for signal patterns
2. Trigger notifications or other actions
3. Log workflow progress
4. Handle errors appropriately

Example script pattern:
```bash
claude /workflows:build research/feature.md 2>&1 | while read line; do
  if [[ "$line" == *"<phase>"*"</phase>"* ]]; then
    phase=$(echo "$line" | sed 's/.*<phase>\(.*\)<\/phase>.*/\1/')
    notify-send "Workflow" "Phase: $phase"
  fi
done
```

## Dependencies

This plugin orchestrates commands from:
- `sdlc-plugin` - `/sdlc:plan`, `/sdlc:implement`
- `github-plugin` - `/github:create-issue-from-plan`, `/github:create-pr`
- `primitives-plugin` - `/primitives:worktree`

Ensure these plugins are installed and working before using workflows.

## Development

### Validate Plugin

```bash
cd workflows-plugin
bun install
bun run validate
```

### Plugin Structure

```
workflows-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── commands/
│   └── build.md             # Main workflow command
├── templates/
│   └── progress.txt.template
├── scripts/
│   ├── workflow-ralph.sh    # Main orchestrator script
│   ├── ci-ralph.sh          # CI resolution loop
│   ├── comments-ralph.sh    # Comment resolution loop
│   ├── validate-plugin.ts
│   └── validate-versions.ts
├── package.json
├── README.md
└── CHANGELOG.md
```

## Shell Scripts (Ralph Pattern)

Run workflows autonomously from the command line using shell scripts. The "Ralph" pattern allows you to start a workflow and walk away while it completes.

### Main Orchestrator

```bash
./scripts/workflow-ralph.sh research/my-feature.md
```

This script:
1. Runs `/workflows:build` in a loop until PR is created
2. Calls `ci-ralph.sh` to resolve CI failures
3. Calls `comments-ralph.sh` to resolve PR comments
4. Logs progress to notification file

### CI Resolution

```bash
./scripts/ci-ralph.sh <pr-number>
```

Autonomously fixes CI failures with up to 10 iterations. Aborts if stuck on the same errors twice.

### Comment Resolution

```bash
./scripts/comments-ralph.sh <pr-number>
```

Autonomously addresses PR review comments with configurable wait time between cycles.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CI_ITERATIONS` | 10 | Max CI fix attempts |
| `CI_RUN_TIMEOUT` | 1800 | CI wait timeout (30 min) |
| `MAX_COMMENT_ITERATIONS` | 10 | Max comment resolution cycles |
| `REVIEWER_WAIT_TIME` | 300 | Wait time between cycles (5 min) |

## Notification System

All scripts log progress to `~/.workflow-notifications.log`:

```
[2026-01-25T14:30:00Z] STARTED workflow-id INIT "Beginning workflow execution"
[2026-01-25T14:35:00Z] PROGRESS workflow-id PLANNING "Plans generated"
[2026-01-25T15:00:00Z] SUCCESS workflow-id COMPLETE "Workflow finished (PR #48)"
[2026-01-25T16:00:00Z] ERROR workflow-id CI_STUCK "Same errors twice"
```

### Log Format

```
[ISO-8601-timestamp] STATUS workflow-id STAGE "message"
```

- **STATUS**: `STARTED`, `PROGRESS`, `SUCCESS`, `ERROR`, `SKIPPED`
- **workflow-id**: Derived from research file or PR number
- **STAGE**: Current phase (INIT, PLANNING, CI_FIX, COMMENTS, etc.)

### Monitoring

```bash
# Watch in real-time
tail -f ~/.workflow-notifications.log

# Filter by status
grep "ERROR" ~/.workflow-notifications.log

# Filter by workflow
grep "pr-123" ~/.workflow-notifications.log
```

## License

MIT
