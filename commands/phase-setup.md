# Phase: Setup

Create isolated workspace and initialize progress tracking.

## Arguments

`$ARGUMENTS` - Path to research file (e.g., `research/my-feature.md`)

## Steps

### 1. Validate Research File

Check that the research file exists and is readable:

```
ls $ARGUMENTS
```

If not found, emit error and stop:
```
<phase>ERROR:SETUP:file_not_found</phase>
<error>Research file not found: $ARGUMENTS</error>
```

### 2. Extract Feature Name

Parse the research file path to derive a branch name:
- `research/auth-system.md` → `feat/auth-system`
- `research/fix-login-bug.md` → `feat/fix-login-bug`

### 3. Create Worktree

Invoke the worktree skill to create an isolated workspace:

```
/primitives:worktree {branch-name}
```

Capture the worktree path from the output.

### 4. Copy Research File

Copy the research file to the worktree so it's available for subsequent phases:

```bash
cp $ARGUMENTS {worktree_path}/
```

### 5. Initialize Progress File

Create `.workflow-progress.txt` in the worktree with initial state:

```
# Workflow Progress
# Generated: {ISO timestamp}
# Research: $ARGUMENTS
# Worktree: {worktree_path}
# Branch: {branch}

## Status
current_phase: SETUP
iteration: 1
started_at: {ISO timestamp}
last_update: {ISO timestamp}

## Plans
total: 0
completed: 0

## PR
number: null
url: null
ci_status: null
ci_attempts: 0

## Comments
total: 0
resolved: 0
pending: 0

## Signals
```

### 6. Emit Signal

Output the completion signal with metadata:

```
<phase>SETUP_COMPLETE</phase>
worktree_path: {path}
branch: {branch}
```

## Error Handling

If any step fails:
1. Log the error
2. Emit error signal: `<phase>ERROR:SETUP:{reason}</phase>`
3. Clean up any partial state

## Output Format

On success:
```
Setup complete.
<phase>SETUP_COMPLETE</phase>
worktree_path: /path/to/.worktrees/feat-my-feature
branch: feat/my-feature
```

On failure:
```
Setup failed: {reason}
<promise>FAILED</promise>
<error>{reason}</error>
```
