---
date: 2026-01-25T14:15:00-08:00
git_commit: 45906e5a63a378d2924c29f32063f09a0cb04395
branch: main
repository: workflows-plugin
topic: "Autonomous Build Workflow - Research to PR Pipeline"
tags: [research, workflow, automation, ralph-pattern, sdlc, ci-cd]
status: complete
last_updated: 2026-01-25
last_updated_by: HAL
---

# Research: Autonomous Build Workflow - Research to PR Pipeline

**Date**: 2026-01-25T14:15:00-08:00
**Git Commit**: 45906e5a63a378d2924c29f32063f09a0cb04395
**Repository**: workflows-plugin (new)

## Research Question

Design and document an autonomous workflow system that takes completed research and delivers a fully-implemented PR with passing CI and all comments resolved - without human intervention after initial trigger.

## Summary

This document specifies `/workflows:build` - an autonomous development workflow that:
1. Takes approved research as input
2. Splits research into complexity-bounded implementation plans
3. Implements each plan sequentially with verification and review loops
4. Creates PR and resolves all CI failures
5. Resolves all reviewer comments (fix or reply with explanation)
6. Loops until PR is fully ready (CI green + comments resolved)

Uses the "Ralph Wiggum" pattern (AFK Ralph) for background execution with external shell scripts driving feedback loops.

## Detailed Findings

### Existing Infrastructure (Current State)

#### SDLC Plugin Commands
Location: `/Users/iamladi/Projects/claude-code-plugins/sdlc-plugin/commands/`

| Command | Purpose | Key Behavior |
|---------|---------|--------------|
| `/sdlc:research` | Explore ideas, document findings | Iterative with human, outputs `research/*.md` |
| `/sdlc:plan` | Create implementation plans | Outputs `plans/*.md` with phases and tasks |
| `/sdlc:implement` | Execute plans via subagents | Dispatches implementer + spec-reviewer + code-quality-reviewer |
| `/sdlc:verify` | Verify implementation matches plan | Runs build, validation, health checks |
| `/sdlc:review` | External LLM code review | Uses Codex/Gemini for review |
| `/sdlc:submit` | Commit and create PR | Wraps commit + `/github:create-pr` |

#### GitHub Plugin Commands
Location: `/Users/iamladi/Projects/claude-code-plugins/github-plugin/`

| Command/Skill | Purpose | Key Behavior |
|---------------|---------|--------------|
| `/github:fix-ci` | Fix CI failures | Analyzes logs, applies fixes |
| `ci-fix-loop` skill | Autonomous CI repair | Max 10 iterations, progress detection, background monitoring |
| `/github:address-pr-comments` | Handle reviewer feedback | Confidence scoring, autonomous mode available |
| `/github:create-pr` | Create PR | Structured body with summary + test plan |

#### Primitives Plugin Commands
Location: `/Users/iamladi/Projects/claude-code-plugins/primitives-plugin/`

| Command | Purpose | Key Behavior |
|---------|---------|--------------|
| `/primitives:commit` | Smart commits | Conventional format, atomic batching |
| `/primitives:worktree` | Create isolated worktree | Full setup automation |

### Ralph Wiggum Pattern (AFK Ralph)

Source: Web research on aihero.dev and GitHub repositories

**Core Concept**: External shell script drives Claude Code in a loop:

```bash
#!/bin/bash
# afk-ralph.sh pattern
MAX_ITERATIONS=10
ITERATION=0

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))

  # Run Claude Code non-interactively
  RESULT=$(claude -p "Your prompt here" --output-format stream-json 2>&1 | \
    jq -r 'select(.type == "text") | .text' | tee /dev/stderr)

  # Check for completion signal
  if echo "$RESULT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "Workflow completed successfully"
    exit 0
  fi

  # Check for failure signal
  if echo "$RESULT" | grep -q "<promise>FAILED</promise>"; then
    echo "Workflow failed - manual intervention required"
    exit 1
  fi

  sleep 5  # Brief pause between iterations
done

echo "Max iterations reached"
exit 2
```

**Key Elements**:
- `-p` flag: Non-interactive/print mode
- `--output-format stream-json`: Streaming output for monitoring
- Completion signals: `<promise>COMPLETE</promise>` or `<promise>FAILED</promise>`
- Progress file: `progress.txt` tracks state between iterations
- jq filtering: Extract readable output from JSON stream

### Workflow Requirements (From Interview)

| Requirement | Decision |
|-------------|----------|
| Research handoff | Takes completed `research/*.md` file as input |
| Plan splitting | By complexity (max 5/10 per plan) |
| PR strategy | One PR per workflow run, sequential plan implementations |
| Comment resolution | Loop until ALL fixed or have explicit reply; handle reviewer back-and-forth |
| Worktree usage | Each `/workflows:build` spawns new worktree |
| Max iterations | 10 for all feedback loops |
| Background execution | External ralph scripts essential; each phase with feedback needs own loop |
| Completion criteria | PR created + CI passing + all comments resolved |

## Architecture Documentation

### Workflow State Machine

```
┌──────────────────────────────────────────────────────────────────────┐
│                        /workflows:build                               │
│                     (Input: research file)                            │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 1: SETUP                                                       │
│  ─────────────────────────────────────────────────────────────────── │
│  • Create worktree: /primitives:worktree {branch-from-research}       │
│  • Verify environment (deps installed, tests pass baseline)           │
│  • Initialize progress.txt                                            │
│  • Signal: <phase>SETUP_COMPLETE</phase>                              │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 2: PLANNING                                                    │
│  ─────────────────────────────────────────────────────────────────── │
│  • Read research file completely                                      │
│  • Split into N plans (complexity ≤ 5/10 each)                        │
│  • Create plan files: plans/workflow-{n}-{slug}.md                    │
│  • Create GitHub issues for each plan                                 │
│  • Update progress.txt with plan list                                 │
│  • Signal: <phase>PLANNING_COMPLETE</phase>                           │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 3: IMPLEMENTATION (per plan, sequential)                       │
│  ─────────────────────────────────────────────────────────────────── │
│  For each plan:                                                       │
│    ┌────────────────────────────────────────────────────────────────┐│
│    │ 3a. Implement: /sdlc:implement {plan}                          ││
│    │     └─→ Subagent loop (max 3 review iterations)                ││
│    │ 3b. Verify: /sdlc:verify {plan}                                ││
│    │     └─→ Build + validation + health checks                     ││
│    │ 3c. Review: /sdlc:review                                       ││
│    │     └─→ External LLM feedback, fix issues                      ││
│    │ 3d. Commit: /primitives:commit                                 ││
│    │     └─→ Atomic commits per batch                               ││
│    └────────────────────────────────────────────────────────────────┘│
│  • Update progress.txt after each plan                                │
│  • Signal per plan: <plan>PLAN_{N}_COMPLETE</plan>                    │
│  • Final signal: <phase>IMPLEMENTATION_COMPLETE</phase>               │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 4: SUBMISSION                                                  │
│  ─────────────────────────────────────────────────────────────────── │
│  • Run /sdlc:submit (creates PR)                                      │
│  • Record PR number in progress.txt                                   │
│  • Signal: <phase>PR_CREATED</phase>                                  │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 5: CI RESOLUTION (Ralph Loop)                       ◄──┐      │
│  ─────────────────────────────────────────────────────────────│───── │
│  • Wait for CI to complete                                    │      │
│  • If PASS → next phase                                       │      │
│  • If FAIL:                                                   │      │
│    └─→ Run /github:fix-ci                                     │      │
│    └─→ Commit + push                                          │      │
│    └─→ Loop (max 10 iterations) ──────────────────────────────┘      │
│  • Progress detection: abort if same errors 2x                        │
│  • Signal: <phase>CI_RESOLVED</phase> or <phase>CI_FAILED</phase>    │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 6: COMMENT RESOLUTION (Ralph Loop)                  ◄──┐      │
│  ─────────────────────────────────────────────────────────────│───── │
│  • Fetch all PR comments                                      │      │
│  • For each unresolved comment:                               │      │
│    └─→ If actionable: fix code + commit + push                │      │
│    └─→ If not fixable: reply with explanation                 │      │
│  • Wait for reviewer response                                 │      │
│  • If new comments → loop ────────────────────────────────────┘      │
│  • Max 10 iterations total                                           │
│  • Completion: ALL comments either fixed or have reply               │
│  • Signal: <phase>COMMENTS_RESOLVED</phase>                          │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 7: COMPLETION                                                  │
│  ─────────────────────────────────────────────────────────────────── │
│  • Verify: CI green + all comments resolved                           │
│  • Generate final report                                              │
│  • Signal: <promise>COMPLETE</promise>                                │
│  • Output: PR URL, summary stats                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Plugin File Structure

```
workflows-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── commands/
│   └── build.md                 # Main /workflows:build command
├── skills/
│   ├── plan-split/
│   │   └── SKILL.md             # Research → multiple plans
│   ├── implement-loop/
│   │   └── SKILL.md             # Single plan implementation with verify+review
│   ├── ci-resolution/
│   │   └── SKILL.md             # CI fix loop wrapper
│   └── comment-resolution/
│       └── SKILL.md             # Comment resolution loop
├── agents/
│   ├── plan-splitter.md         # Splits research by complexity
│   └── comment-resolver.md      # Handles comment back-and-forth
├── scripts/
│   ├── workflow-ralph.sh        # Main workflow runner script
│   ├── ci-ralph.sh              # CI resolution loop script
│   ├── comments-ralph.sh        # Comment resolution loop script
│   └── validate-plugin.ts       # Plugin validation
├── templates/
│   └── progress.txt.template    # Progress file template
├── research/
│   └── (this file)
├── package.json
├── README.md
└── CHANGELOG.md
```

### Progress File Format

```
# Workflow Progress
# Generated: {timestamp}
# Research: {research_file}
# Worktree: {worktree_path}
# Branch: {branch_name}

## Status
current_phase: IMPLEMENTATION
iteration: 3
started_at: 2026-01-25T10:00:00Z
last_update: 2026-01-25T11:30:00Z

## Plans
total: 3
completed: 1
- [x] plans/workflow-1-setup-auth.md (issue: #45)
- [ ] plans/workflow-2-add-oauth.md (issue: #46) <- CURRENT
- [ ] plans/workflow-3-migration.md (issue: #47)

## PR
number: 48
url: https://github.com/owner/repo/pull/48
ci_status: failing
ci_attempts: 2

## Comments
total: 5
resolved: 3
pending: 2
- [x] @reviewer1: "Use const instead of let" -> FIXED
- [x] @reviewer1: "Add null check" -> FIXED
- [x] @reviewer2: "Why this approach?" -> REPLIED
- [ ] @reviewer1: "Tests for edge case?" <- PENDING
- [ ] @reviewer2: "Performance concern" <- PENDING

## Signals
<phase>SETUP_COMPLETE</phase>
<phase>PLANNING_COMPLETE</phase>
<plan>PLAN_1_COMPLETE</plan>
```

### Notification Log Format

File: `~/.workflow-notifications.log`

```
[2026-01-25T14:30:00-08:00] SUCCESS workflow-20260125-143000 PR#48 https://github.com/owner/repo/pull/48
[2026-01-25T15:45:00-08:00] FAILED workflow-20260125-154500 CI_RESOLUTION "Max iterations reached - same errors persisting"
[2026-01-25T16:00:00-08:00] FAILED workflow-20260125-160000 COMMENT_RESOLUTION "Reviewer @bob still requesting changes after 10 attempts"
```

Format: `[timestamp] STATUS workflow-id STAGE "message"`

Scripts append to this file. User can `tail -f ~/.workflow-notifications.log` to monitor.

### Shell Script: workflow-ralph.sh

```bash
#!/bin/bash
set -e

# Configuration
MAX_ITERATIONS=${MAX_ITERATIONS:-10}
RESEARCH_FILE="$1"
WORKTREE_NAME="workflow-$(date +%Y%m%d-%H%M%S)"
PROGRESS_FILE=".workflow-progress.txt"

if [ -z "$RESEARCH_FILE" ]; then
  echo "Usage: workflow-ralph.sh <research-file>"
  exit 1
fi

# Phase 1-4: Main workflow (setup through PR creation)
echo "Starting autonomous workflow..."
echo "Research: $RESEARCH_FILE"
echo "Max iterations: $MAX_ITERATIONS"

ITERATION=0
while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Iteration $ITERATION / $MAX_ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Run main workflow
  RESULT=$(claude -p "/workflows:build $RESEARCH_FILE --continue" \
    --output-format stream-json 2>&1 | \
    jq -r 'select(.type == "text") | .text' | tee /dev/stderr)

  # Check for PR created signal
  if echo "$RESULT" | grep -q "<phase>PR_CREATED</phase>"; then
    echo "PR created - starting CI resolution phase..."
    break
  fi

  # Check for failure
  if echo "$RESULT" | grep -q "<promise>FAILED</promise>"; then
    echo "Workflow failed - check logs"
    exit 1
  fi

  sleep 5
done

# Extract PR number from progress file
PR_NUMBER=$(grep "^number:" "$PROGRESS_FILE" | cut -d' ' -f2)

if [ -z "$PR_NUMBER" ]; then
  echo "No PR number found - workflow incomplete"
  exit 1
fi

# Phase 5: CI Resolution Loop
echo ""
echo "Starting CI resolution loop for PR #$PR_NUMBER..."
./scripts/ci-ralph.sh "$PR_NUMBER"
CI_EXIT=$?

if [ $CI_EXIT -ne 0 ]; then
  echo "CI resolution failed after max attempts"
  exit 1
fi

# Phase 6: Comment Resolution Loop
echo ""
echo "Starting comment resolution loop for PR #$PR_NUMBER..."
./scripts/comments-ralph.sh "$PR_NUMBER"
COMMENTS_EXIT=$?

if [ $COMMENTS_EXIT -ne 0 ]; then
  echo "Comment resolution failed after max attempts"
  exit 1
fi

# Phase 7: Final verification
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "WORKFLOW COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PR: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pull/$PR_NUMBER"
echo "CI: Passing"
echo "Comments: All resolved"

exit 0
```

### Shell Script: ci-ralph.sh

```bash
#!/bin/bash
set -e

PR_NUMBER="$1"
MAX_ITERATIONS=${CI_MAX_ITERATIONS:-10}
POLL_INTERVAL=60

if [ -z "$PR_NUMBER" ]; then
  echo "Usage: ci-ralph.sh <pr-number>"
  exit 1
fi

ITERATION=0
LAST_ERRORS=""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "CI Fix Attempt $ITERATION / $MAX_ITERATIONS"

  # Wait for CI to complete
  echo "Waiting for CI..."
  TIMEOUT=1800  # 30 min
  START=$(date +%s)

  while true; do
    STATUS=$(gh pr checks "$PR_NUMBER" --json state -q '.[].state' 2>/dev/null | sort -u)

    if echo "$STATUS" | grep -q "SUCCESS"; then
      if ! echo "$STATUS" | grep -q "FAILURE\|PENDING"; then
        echo "<phase>CI_RESOLVED</phase>"
        exit 0
      fi
    fi

    if echo "$STATUS" | grep -q "FAILURE"; then
      if ! echo "$STATUS" | grep -q "PENDING"; then
        echo "CI failed - attempting fix..."
        break
      fi
    fi

    ELAPSED=$(($(date +%s) - START))
    if [ $ELAPSED -gt $TIMEOUT ]; then
      echo "CI timeout after 30 minutes"
      break
    fi

    sleep $POLL_INTERVAL
  done

  # Run fix-ci
  RESULT=$(claude -p "/github:fix-ci $PR_NUMBER" \
    --output-format stream-json 2>&1 | \
    jq -r 'select(.type == "text") | .text' | tee /dev/stderr)

  # Extract current errors for progress detection
  CURRENT_ERRORS=$(echo "$RESULT" | grep -o "errors_found: [0-9]*" || echo "unknown")

  if [ "$CURRENT_ERRORS" = "$LAST_ERRORS" ] && [ $ITERATION -gt 1 ]; then
    echo "Same errors detected - may need manual intervention"
    # Continue anyway, let max iterations handle it
  fi
  LAST_ERRORS="$CURRENT_ERRORS"

  # Commit and push if changes made
  if [ -n "$(git status --porcelain)" ]; then
    git add .
    git commit -m "fix(ci): automated fix attempt $ITERATION"
    git push
  fi

  sleep 10  # Brief pause before checking CI again
done

echo "<phase>CI_FAILED</phase>"
exit 1
```

### Shell Script: comments-ralph.sh

```bash
#!/bin/bash
set -e

PR_NUMBER="$1"
MAX_ITERATIONS=${COMMENTS_MAX_ITERATIONS:-10}
POLL_INTERVAL=120  # 2 min between checks for new comments

if [ -z "$PR_NUMBER" ]; then
  echo "Usage: comments-ralph.sh <pr-number>"
  exit 1
fi

ITERATION=0

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "Comment Resolution Attempt $ITERATION / $MAX_ITERATIONS"

  # Count unresolved comments
  PENDING=$(gh api repos/{owner}/{repo}/pulls/$PR_NUMBER/comments \
    --jq '[.[] | select(.body | contains("LGTM") | not)] | length' 2>/dev/null || echo "0")

  PENDING_REVIEWS=$(gh pr view "$PR_NUMBER" --json reviews \
    --jq '[.reviews[] | select(.state == "CHANGES_REQUESTED")] | length' 2>/dev/null || echo "0")

  echo "Pending comments: $PENDING"
  echo "Pending reviews: $PENDING_REVIEWS"

  if [ "$PENDING" = "0" ] && [ "$PENDING_REVIEWS" = "0" ]; then
    echo "All comments resolved!"
    echo "<phase>COMMENTS_RESOLVED</phase>"
    exit 0
  fi

  # Run comment resolution
  RESULT=$(claude -p "/workflows:resolve-comments $PR_NUMBER --all" \
    --output-format stream-json 2>&1 | \
    jq -r 'select(.type == "text") | .text' | tee /dev/stderr)

  # Check if any changes were made
  if [ -n "$(git status --porcelain)" ]; then
    git add .
    git commit -m "fix: address PR review comments (attempt $ITERATION)"
    git push
  fi

  # Wait for reviewer response
  echo "Waiting for reviewer feedback..."
  sleep $POLL_INTERVAL

done

echo "<phase>COMMENTS_FAILED</phase>"
exit 1
```

### Command: /workflows:build

```markdown
---
name: build
description: Autonomous workflow from research to PR with CI and comments resolved
---

# Autonomous Build Workflow

Execute complete development cycle from approved research to merged-ready PR.

## Input
$ARGUMENTS - Path to approved research file (e.g., research/my-feature.md)

## Workflow

### Phase 1: Setup

1. Validate research file exists and is complete
2. Extract feature name from research for branch naming
3. Create worktree:
   ```
   /primitives:worktree {feature-branch}
   ```
4. Initialize progress.txt
5. Signal: `<phase>SETUP_COMPLETE</phase>`

### Phase 2: Planning

1. Read research file completely
2. Invoke plan-splitter agent to divide into implementation plans
3. For each plan:
   - Create plan file: `plans/workflow-{n}-{slug}.md`
   - Create GitHub issue: `/github:create-issue-from-plan`
4. Update progress.txt with plan list
5. Signal: `<phase>PLANNING_COMPLETE</phase>`

### Phase 3: Implementation

For each plan in sequence:

1. **Implement**: `/sdlc:implement {plan-file}`
   - Uses subagent workflow (implementer + reviewers)
   - Max 3 review iterations per task

2. **Verify**: `/sdlc:verify {plan-file}`
   - Build validation
   - Health checks
   - If fails: fix and retry

3. **Review**: `/sdlc:review`
   - External LLM review (Codex/Gemini)
   - Address feedback

4. **Commit**: `/primitives:commit`
   - Atomic commits per change batch

5. Update progress.txt
6. Signal: `<plan>PLAN_{N}_COMPLETE</plan>`

After all plans: `<phase>IMPLEMENTATION_COMPLETE</phase>`

### Phase 4: Submission

1. Run `/sdlc:submit` with all plan references
2. Record PR number in progress.txt
3. Signal: `<phase>PR_CREATED</phase>`

**STOP HERE** - External ralph scripts handle CI and comment resolution.

### --continue Flag

When invoked with `--continue`:
1. Read progress.txt to determine current state
2. Resume from last incomplete phase/plan
3. Skip completed work

## Output

Progress file updated with current state.
Signals emitted for external script coordination.

## Error Handling

- If plan implementation fails 3x: mark plan as blocked, report
- If verification fails: attempt fix, max 3 retries
- If external review has critical issues: pause for human review
- Always update progress.txt before signaling

## Completion Signals

- `<phase>SETUP_COMPLETE</phase>` - Worktree ready
- `<phase>PLANNING_COMPLETE</phase>` - Plans created
- `<plan>PLAN_N_COMPLETE</plan>` - Plan N implemented
- `<phase>IMPLEMENTATION_COMPLETE</phase>` - All plans done
- `<phase>PR_CREATED</phase>` - PR submitted
- `<promise>FAILED</promise>` - Unrecoverable error
```

### Skill: plan-split

```markdown
---
name: plan-split
description: Split research document into complexity-bounded implementation plans
---

# Plan Splitting Skill

Analyze research document and create multiple implementation plans, each with complexity ≤ 5/10.

## Complexity Scoring

Score each potential task 1-10 based on:

| Factor | Points |
|--------|--------|
| Files touched | 1-3 files: 1pt, 4-6: 2pt, 7+: 3pt |
| New vs modify | New code: 1pt, Modify existing: 2pt |
| External deps | None: 0pt, New deps: 2pt |
| Test coverage | Simple: 1pt, Complex: 2pt |
| Risk level | Low: 0pt, Medium: 1pt, High: 2pt |

**Max 5/10 per plan** to fit in single context window.

## Splitting Strategy

1. Read research document
2. Identify all implementation tasks
3. Score each task
4. Group into plans such that:
   - Total complexity ≤ 5
   - Logical cohesion (related tasks together)
   - Dependencies respected (prerequisite tasks in earlier plans)
5. Generate plan files with standard format

## Output

For each plan, create `plans/workflow-{n}-{slug}.md`:

```markdown
---
complexity: 4
depends_on: [workflow-1-setup]
issue: (to be filled)
---

# Plan: {Title}

## Overview
{What this plan accomplishes}

## Implementation Phases

### Phase 1: {Name}
- [ ] Task 1 (complexity: 2)
- [ ] Task 2 (complexity: 1)

### Phase 2: {Name}
- [ ] Task 3 (complexity: 1)

## Files to Modify
- path/to/file.ts

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```
```

### Skill: comment-resolution

```markdown
---
name: comment-resolution
description: Resolve ALL PR comments - fix code or reply with explanation
---

# Comment Resolution Skill

Process every unresolved PR comment until all are addressed.

## Rules

1. **Every comment gets resolution** - either:
   - Code fix + commit
   - Reply explaining why not fixed

2. **Handle back-and-forth** - if reviewer responds to your reply:
   - Re-evaluate their feedback
   - Fix if convinced, or provide more detailed explanation

3. **Track all comments** - maintain list of:
   - Fixed comments
   - Replied comments
   - Pending comments

## Process

### Fetch Comments

```bash
# Get all review comments
gh api repos/{owner}/{repo}/pulls/{pr}/comments

# Get review threads
gh api repos/{owner}/{repo}/pulls/{pr}/reviews

# Get issue comments (general discussion)
gh api repos/{owner}/{repo}/issues/{pr}/comments
```

### Categorize Each Comment

For each unresolved comment:

1. **Actionable + Clear** → Fix code
   - Has specific file/line reference
   - Clear request for change

2. **Actionable + Unclear** → Ask for clarification via reply

3. **Not actionable** → Reply with explanation
   - "This is intentional because..."
   - "Out of scope for this PR because..."
   - "Will address in follow-up because..."

### Apply Fixes

For fixable comments:
1. Read the relevant file
2. Apply the requested change
3. Reply to comment: "Fixed in {commit-sha}"

### Reply to Non-Fixes

For comments not being fixed:
1. Draft explanation (technical reasoning)
2. Post reply via GitHub API:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies \
     -f body="Explanation here..."
   ```

## Completion Criteria

ALL comments must have:
- A code fix committed, OR
- A reply posted explaining the decision

No pending/unaddressed comments remain.

## Output

```
Comment Resolution Summary:
- Fixed: 5 comments
- Replied: 2 comments
- Pending: 0 comments

All comments resolved.
<phase>COMMENTS_RESOLVED</phase>
```
```

## Code References

### Existing CI Fix Loop
- `/Users/iamladi/Projects/claude-code-plugins/github-plugin/skills/ci-fix-loop/SKILL.md` - Full autonomous CI repair pattern

### Existing PR Comment Handling
- `/Users/iamladi/Projects/claude-code-plugins/github-plugin/commands/address-pr-comments.md` - Confidence scoring system

### Existing Implementation Flow
- `/Users/iamladi/Projects/claude-code-plugins/sdlc-plugin/commands/implement.md` - Subagent dispatch pattern

### Existing Worktree Setup
- `/Users/iamladi/Projects/claude-code-plugins/primitives-plugin/skills/worktree/SKILL.md` - Isolated environment creation

## Design Decisions (Resolved)

1. **PR Merge**: Stop at "ready for merge" - human triggers final merge

2. **Parallel Plans**: Sequential only - most plans have dependencies

3. **Cost Estimation**: Not needed

4. **Notifications**: Write to `~/.workflow-notifications.log` on completion/failure (simple file-based)

5. **Rollback**: No automated rollback - notify human on failure, they handle cleanup

## Next Steps

1. Create plugin scaffold (plugin.json, package.json)
2. Implement `/workflows:build` command
3. Implement plan-split skill with complexity scoring
4. Implement comment-resolution skill with reply capability
5. Create shell scripts (workflow-ralph.sh, ci-ralph.sh, comments-ralph.sh)
6. Test with real research document
7. Document usage in README
