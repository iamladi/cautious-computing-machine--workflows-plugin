---
title: "Workflows Plugin - Shell Scripts & Notifications"
type: Feature
issue: null
research: [research/research-autonomous-workflow-build.md]
status: Draft
created: 2026-01-25
depends_on: [plan-1-plugin-scaffold-and-build-command.md, plan-2-plan-splitting-system.md, plan-3-comment-resolution-system.md]
---

# PRD: Workflows Plugin - Shell Scripts & Notifications

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 4/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
The "Ralph Wiggum" pattern requires external shell scripts to drive Claude Code in loops for CI and comment resolution phases. These scripts need to parse completion signals, manage iterations, and log notifications for monitoring.

### Goals & Objectives
1. Implement `workflow-ralph.sh` main orchestrator script
2. Implement `ci-ralph.sh` CI resolution loop script
3. Implement `comments-ralph.sh` comment resolution loop script
4. Implement notification logging to `~/.workflow-notifications.log`

### Success Metrics
- **Primary Metric**: Full workflow runs autonomously via shell script
- **Secondary Metrics**:
  - Scripts correctly parse completion signals
  - Max 10 iterations enforced
  - Notifications logged on success/failure
- **Quality Gates**: Scripts are executable and work with Claude CLI

## User Stories

### Story 1: AFK Workflow Execution
- **As a**: Developer
- **I want**: To run `./scripts/workflow-ralph.sh research/my-feature.md` and walk away
- **So that**: The entire workflow completes without my intervention
- **Acceptance Criteria**:
  - [ ] Script orchestrates all phases
  - [ ] CI failures are automatically fixed
  - [ ] PR comments are automatically resolved
  - [ ] Notification logged on completion

### Story 2: Workflow Monitoring
- **As a**: Developer
- **I want**: To monitor workflow progress via notification log
- **So that**: I know when workflows complete or fail
- **Acceptance Criteria**:
  - [ ] Success logged with PR URL
  - [ ] Failure logged with reason
  - [ ] Can `tail -f ~/.workflow-notifications.log`

## Requirements

### Functional Requirements

1. **FR-1**: Main Orchestrator Script
   - Details: `workflow-ralph.sh` drives phases 1-4, then calls ci/comment scripts
   - Priority: Must Have

2. **FR-2**: CI Resolution Script
   - Details: `ci-ralph.sh` loops until CI passes or max iterations
   - Priority: Must Have

3. **FR-3**: Comment Resolution Script
   - Details: `comments-ralph.sh` loops until all comments resolved
   - Priority: Must Have

4. **FR-4**: Notification Logging
   - Details: Append to `~/.workflow-notifications.log` on completion/failure
   - Priority: Must Have

5. **FR-5**: Progress Detection
   - Details: Abort CI loop if same errors detected 2x in a row
   - Priority: Should Have

### Technical Requirements

- **Shell**: Bash (macOS/Linux compatible)
- **Dependencies**: `claude` CLI, `gh` CLI, `jq`
- **Output Format**: Uses `--output-format stream-json` for signal parsing
- **Timeout**: CI wait max 30 min, overall max 10 iterations

## Scope

### In Scope
- `scripts/workflow-ralph.sh` - Main orchestrator
- `scripts/ci-ralph.sh` - CI fix loop
- `scripts/comments-ralph.sh` - Comment resolution loop
- Notification log format and writing
- Signal parsing with jq

### Out of Scope
- Windows support
- Alternative notification methods (Slack, Telegram)

## Implementation Plan

### Phase 1: Main Orchestrator Script
**Complexity**: 2 | **Priority**: High

- [ ] Create `scripts/workflow-ralph.sh`:
  - Parse research file argument
  - Run Claude with `/workflows:build` in loop
  - Parse `<phase>PR_CREATED</phase>` signal to break
  - Extract PR number from progress file
  - Call ci-ralph.sh and comments-ralph.sh
  - Log success notification

### Phase 2: CI Resolution Script
**Complexity**: 1 | **Priority**: High

- [ ] Create `scripts/ci-ralph.sh`:
  - Parse PR number argument
  - Poll CI status via `gh pr checks`
  - If failing, invoke `/github:fix-ci`
  - Commit and push changes
  - Track errors for progress detection
  - Loop until success or max iterations
  - Log failure notification if max reached

### Phase 3: Comment Resolution Script
**Complexity**: 1 | **Priority**: High

- [ ] Create `scripts/comments-ralph.sh`:
  - Parse PR number argument
  - Count pending comments via `gh api`
  - If pending, invoke `/workflows:resolve-comments`
  - Commit and push changes
  - Wait for reviewer response
  - Loop until resolved or max iterations
  - Log failure notification if max reached

### Phase 4: Notification System
**Complexity**: 1 | **Priority**: Medium

- [ ] Implement notification logging in each script:
  - Format: `[timestamp] STATUS workflow-id STAGE "message"`
  - File: `~/.workflow-notifications.log`
  - Append mode (don't overwrite)
- [ ] Document monitoring with `tail -f`

### Phase 5: Validation
**Complexity**: 1 | **Priority**: High

- [ ] Make scripts executable (`chmod +x`)
- [ ] Test signal parsing with mock output
- [ ] Test notification logging
- [ ] Document usage in README

## Relevant Files

### Existing Files
- `github-plugin/skills/ci-fix-loop/SKILL.md` - CI loop pattern reference

### New Files
- `scripts/workflow-ralph.sh` - Main orchestrator
- `scripts/ci-ralph.sh` - CI resolution loop
- `scripts/comments-ralph.sh` - Comment resolution loop

## Testing Strategy

### Manual Test Cases

1. **Test Case: Signal Parsing**
   - Steps: Run script with mock Claude output containing signals
   - Expected: Signals correctly detected

2. **Test Case: Notification Logging**
   - Steps: Trigger success/failure conditions
   - Expected: Entries appear in log file

3. **Test Case: Max Iterations**
   - Steps: Create failing condition, run script
   - Expected: Stops after 10 iterations with failure notification

## Acceptance Criteria

- [ ] Scripts are executable
- [ ] Signals correctly parsed from Claude output
- [ ] CI loop works with real PR
- [ ] Comment loop works with real PR
- [ ] Notifications logged correctly
- [ ] Max iterations enforced
- [ ] Progress detection aborts on stuck errors

## Notes & Context

### Signal Format
- Phase signals: `<phase>PHASE_NAME</phase>`
- Completion: `<promise>COMPLETE</promise>`
- Failure: `<promise>FAILED</promise>`

### Notification Log Format
```
[2026-01-25T14:30:00-08:00] SUCCESS workflow-20260125-143000 PR#48 https://github.com/owner/repo/pull/48
[2026-01-25T15:45:00-08:00] FAILED workflow-20260125-154500 CI_RESOLUTION "Max iterations reached"
```

### References
- Research spec: Shell script sections
- Ralph pattern: https://www.aihero.dev/heres-how-to-stream-claude-code-with-afk-ralph
