# Build Workflow

Orchestrate the full SDLC pipeline from research file to merged PR.

## Arguments

- `$ARGUMENTS` - Path to research file (e.g., `research/my-feature.md`)
- `--continue` - Resume from last checkpoint (reads existing progress file)

## Progress File

The workflow maintains state in `.workflow-progress.txt` at the worktree root. This enables:
- Resumption after interruptions
- External script coordination via phase signals
- Progress visibility

### Progress File Schema

```
# Workflow Progress
# Generated: {ISO timestamp}
# Research: {research_file}
# Worktree: {worktree_path}
# Branch: {branch_name}

## Status
current_phase: SETUP|PLANNING|IMPLEMENTATION|SUBMISSION|CI_RESOLUTION|COMMENT_RESOLUTION|COMPLETE
iteration: {number}
started_at: {ISO timestamp}
last_update: {ISO timestamp}

## Plans
total: {number}
completed: {number}
- [x] plans/workflow-1-xxx.md (issue: #N)
- [ ] plans/workflow-2-xxx.md (issue: #N) <- CURRENT

## PR
number: {number or null}
url: {url or null}
ci_status: pending|passing|failing
ci_attempts: {number}

## Comments
total: {number}
resolved: {number}
pending: {number}

## Signals
{list of emitted signals with timestamps}
```

## Phase Signals

Emit signals for external script coordination:
- `<phase>SETUP_COMPLETE</phase>` - Worktree created, dependencies installed
- `<phase>PLANNING_COMPLETE</phase>` - Plans generated
- `<phase>IMPLEMENTATION_COMPLETE</phase>` - All plans implemented
- `<phase>SUBMISSION_COMPLETE</phase>` - PR created and pushed
- `<phase>WORKFLOW_COMPLETE</phase>` - Entire workflow finished

## Workflow Phases

### Phase 1: Setup

**Goal**: Create isolated workspace and initialize progress tracking.

1. **Validate input**
   - Check `$ARGUMENTS` is provided (unless `--continue`)
   - Verify research file exists
   - Extract feature name from research file for branch naming

2. **Create worktree**
   - Invoke `/primitives:worktree {branch-name}`
   - Wait for worktree setup to complete
   - Capture worktree path

3. **Initialize progress file**
   - Create `.workflow-progress.txt` in worktree
   - Set `current_phase: SETUP`
   - Set `started_at` to current timestamp

4. **Emit signal**
   ```
   <phase>SETUP_COMPLETE</phase>
   ```

5. **Update progress**
   - Set `current_phase: PLANNING`
   - Update `last_update`

### Phase 2: Planning

**Goal**: Generate implementation plans from research.

1. **Invoke plan-split skill**
   - Run `/workflows:plan-split {research-file}`
   - This skill handles:
     - Analyzing research via plan-splitter agent
     - Scoring tasks by complexity
     - Splitting into multiple plans (complexity ≤ 5)
     - Creating GitHub issues for each plan
   - Capture generated plan paths and issue numbers

2. **Update progress file**
   - Set `total` to number of plans
   - List all plans with issue numbers
   - Mark first plan as CURRENT

3. **Emit signal**
   ```
   <phase>PLANNING_COMPLETE</phase>
   ```

4. **Update progress**
   - Set `current_phase: IMPLEMENTATION`
   - Update `last_update`

### Phase 3: Implementation

**Goal**: Execute each plan sequentially.

For each plan in the plans list:

1. **Check if already completed**
   - If `[x]` in progress file, skip
   - If `[ ]`, proceed

2. **Implement plan**
   - Run `/sdlc:implement {plan-path}`
   - Wait for implementation to complete

3. **Update progress**
   - Mark plan as `[x]` completed
   - Increment `completed` count
   - Move CURRENT marker to next plan
   - Update `last_update`

4. **Emit signal** (after all plans done)
   ```
   <phase>IMPLEMENTATION_COMPLETE</phase>
   ```

5. **Update progress**
   - Set `current_phase: SUBMISSION`
   - Update `last_update`

### Phase 4: Submission

**Goal**: Create and push PR.

1. **Create PR**
   - Run `/github:create-pr`
   - Capture PR number and URL

2. **Update progress file**
   - Set `number` and `url` in PR section
   - Set `ci_status: pending`

3. **Emit signal**
   ```
   <phase>SUBMISSION_COMPLETE</phase>
   ```

4. **Report status**
   ```
   PR created: {url}

   Next steps (handled by external scripts or future commands):
   - Monitor CI status
   - Address any CI failures
   - Respond to review comments

   To continue after manual review:
   - /workflows:build --continue
   ```

5. **Update progress**
   - Set `current_phase: COMPLETE` (for now, CI/comments are separate plans)
   - Update `last_update`

6. **Emit final signal**
   ```
   <phase>WORKFLOW_COMPLETE</phase>
   ```

## Resume Logic (`--continue`)

When `--continue` flag is provided:

1. **Find progress file**
   - Look for `.workflow-progress.txt` in current directory or `.worktrees/*/`
   - If not found, error: "No workflow in progress. Start with: /workflows:build <research-file>"

2. **Read current state**
   - Parse progress file
   - Determine `current_phase`

3. **Resume from checkpoint**
   - SETUP: Re-run setup (idempotent)
   - PLANNING: Continue with planning
   - IMPLEMENTATION: Continue from first uncompleted plan
   - SUBMISSION: Re-attempt PR creation
   - COMPLETE: Report "Workflow already complete"

4. **Continue execution**
   - Pick up from the current phase
   - Follow normal workflow from that point

## Error Handling

### Research File Not Found
```
Error: Research file not found: {path}
Please provide a valid research file path.
```

### Worktree Creation Fails
```
Error: Failed to create worktree.
Check git status and try again.
```

### Command Invocation Fails
- Log the error
- Update progress file with error state
- Emit error signal: `<phase>ERROR:{phase}:{message}</phase>`
- Stop and report

### Progress File Corrupt
- Attempt recovery by re-reading
- If unrecoverable, offer to start fresh

## Example Usage

### Start New Workflow
```
/workflows:build research/my-feature.md
```

### Resume After Interruption
```
/workflows:build --continue
```

## Notes

- This command orchestrates other commands; it doesn't implement logic directly
- Each phase is designed to be resumable
- Progress file is human-readable for debugging
- Signals use XML-style tags for easy parsing by external scripts
- CI resolution and comment resolution are out of scope (Plan 2 & 3)

## Implementation

### Step 1: Parse Arguments

Check if `$ARGUMENTS` contains:
- `--continue` flag → enter resume mode
- Research file path → enter new workflow mode
- Empty → error with usage instructions

### Step 2: Execute Appropriate Mode

**New Workflow Mode:**
1. Validate research file exists
2. Derive branch name from research file (e.g., `research/auth-system.md` → `feat/auth-system`)
3. Execute Phase 1-4 sequentially
4. Update progress file after each phase
5. Emit signals at phase transitions

**Resume Mode:**
1. Find and parse progress file
2. Determine current phase
3. Resume execution from that phase
4. Continue through remaining phases

### Step 3: Report Completion

At end of workflow:
```
Workflow Complete

Research: {research_file}
Branch: {branch_name}
PR: {pr_url}

Phases completed:
  [x] Setup
  [x] Planning ({n} plans)
  [x] Implementation
  [x] Submission

Time elapsed: {duration}

Next: Monitor CI and address review comments
```
