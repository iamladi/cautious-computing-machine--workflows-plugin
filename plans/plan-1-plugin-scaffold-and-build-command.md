---
title: "Workflows Plugin - Foundation & Core Build Command"
type: Feature
issue: null
research: [research/research-autonomous-workflow-build.md]
status: Draft
created: 2026-01-25
---

# PRD: Workflows Plugin - Foundation & Core Build Command

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 5/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
The current SDLC workflow requires manual orchestration of multiple commands (`/sdlc:research` → `/sdlc:plan` → `/sdlc:implement` → `/sdlc:verify` → `/sdlc:review` → `/sdlc:commit` → `/sdlc:submit` → `/github:fix-ci` → `/github:address-pr-comments`). Each step requires human intervention to trigger the next, leading to context-switching overhead and blocking developer time.

### Goals & Objectives
1. Create new `workflows-plugin` with proper Claude Code plugin structure
2. Implement `/workflows:build` command that orchestrates the full pipeline
3. Enable state persistence via progress file for resumable workflows
4. Support the "Ralph pattern" with completion signals for external script coordination
5. Integrate with existing SDLC/GitHub/Primitives plugins via slash command invocation

### Success Metrics
- **Primary Metric**: Plugin loads successfully in Claude Code
- **Secondary Metrics**:
  - `/workflows:build` creates worktree and initializes progress file
  - Progress file correctly tracks workflow state
  - Completion signals are emitted at each phase
- **Quality Gates**: `bun run validate` passes

## User Stories

### Story 1: Autonomous Workflow Trigger
- **As a**: Developer
- **I want**: To run `/workflows:build research/my-feature.md` and walk away
- **So that**: The entire implementation pipeline runs autonomously
- **Acceptance Criteria**:
  - [ ] Command accepts research file path as argument
  - [ ] Creates isolated worktree for the work
  - [ ] Initializes progress.txt with workflow state
  - [ ] Emits phase completion signals

### Story 2: Resumable Workflow
- **As a**: Developer
- **I want**: To resume a workflow that was interrupted
- **So that**: I don't lose progress on long-running implementations
- **Acceptance Criteria**:
  - [ ] `--continue` flag resumes from last checkpoint
  - [ ] Progress file is read and state is restored
  - [ ] Completed phases are skipped

## Requirements

### Functional Requirements

1. **FR-1**: Plugin Manifest
   - Details: Valid plugin.json with name, version, description, author
   - Priority: Must Have

2. **FR-2**: Build Command
   - Details: `/workflows:build <research-file>` command that orchestrates phases 1-4
   - Priority: Must Have

3. **FR-3**: Progress Tracking
   - Details: Progress file format per research spec with phase/plan tracking
   - Priority: Must Have

4. **FR-4**: Phase Signals
   - Details: Emit `<phase>PHASE_NAME</phase>` signals for external script coordination
   - Priority: Must Have

5. **FR-5**: Worktree Integration
   - Details: Invoke `/primitives:worktree` to create isolated environment
   - Priority: Must Have

### Non-Functional Requirements

1. **NFR-1**: Compatibility
   - Requirement: Works with existing plugin ecosystem
   - Target: Invokes SDLC/GitHub/Primitives commands without modification
   - Measurement: Commands execute successfully

2. **NFR-2**: State Persistence
   - Requirement: Progress survives Claude Code restarts
   - Target: File-based state in `.workflow-progress.txt`
   - Measurement: Resume works after restart

### Technical Requirements

- **Stack**: Markdown commands, TypeScript validation script
- **Dependencies**: zod (for plugin.json validation)
- **Architecture**: Standard Claude Code plugin structure

## Scope

### In Scope
- Plugin scaffold (plugin.json, package.json, scripts/)
- `/workflows:build` command (phases 1-4: setup, planning, implementation, submission)
- Progress file format and management
- Phase completion signals
- `--continue` flag for resumption

### Out of Scope
- CI resolution loop (Plan 2)
- Comment resolution loop (Plan 3)
- Shell scripts (Plan 4)
- plan-split skill (Plan 2)
- comment-resolution skill (Plan 3)

### Future Considerations
- Notification system integration
- Multiple parallel workflows
- Cost tracking

## Solution Design

### Approach
Create a standard Claude Code plugin with a single main command (`/workflows:build`) that:
1. Validates input research file
2. Creates worktree via existing `/primitives:worktree`
3. Initializes progress tracking file
4. Orchestrates phases sequentially, invoking existing commands
5. Emits signals for external script coordination

### Progress File Schema
```
# Workflow Progress
# Generated: {timestamp}
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
{list of emitted signals}
```

## Implementation Plan

### Phase 1: Plugin Scaffold
**Complexity**: 2 | **Priority**: High

- [ ] Create `.claude-plugin/plugin.json` with required fields
- [ ] Create `package.json` with dependencies and scripts
- [ ] Create `scripts/validate-plugin.ts` (copy from existing plugin)
- [ ] Create directory structure (commands/, skills/, agents/, scripts/, templates/)
- [ ] Verify `bun run validate` passes

### Phase 2: Progress File Management
**Complexity**: 1 | **Priority**: High

- [ ] Create `templates/progress.txt.template` with placeholder format
- [ ] Document progress file schema in command

### Phase 3: Core Build Command
**Complexity**: 2 | **Priority**: High

- [ ] Create `commands/build.md` with full workflow logic
- [ ] Implement Phase 1 (Setup): worktree creation, progress init
- [ ] Implement Phase 2 (Planning): placeholder for plan-split (will invoke `/sdlc:plan` for now)
- [ ] Implement Phase 3 (Implementation): sequential plan execution
- [ ] Implement Phase 4 (Submission): PR creation
- [ ] Add `--continue` flag handling for resumption
- [ ] Emit phase signals at each transition

### Phase 4: Documentation
**Complexity**: 1 | **Priority**: Medium

- [ ] Create README.md with usage instructions
- [ ] Create CHANGELOG.md with initial version
- [ ] Document signal format for external scripts

### Phase 5: Validation
**Complexity**: 1 | **Priority**: High

- [ ] Run `bun run validate`
- [ ] Test command loading in Claude Code
- [ ] Verify progress file creation
- [ ] Verify signal emission

## Relevant Files

### Existing Files (Reference)
- `sdlc-plugin/.claude-plugin/plugin.json` - Plugin manifest example
- `sdlc-plugin/commands/implement.md` - Subagent orchestration pattern
- `primitives-plugin/skills/worktree/SKILL.md` - Worktree creation reference
- `github-plugin/skills/ci-fix-loop/SKILL.md` - Loop pattern with signals

### New Files
- `.claude-plugin/plugin.json` - Plugin manifest
- `package.json` - Dependencies and scripts
- `scripts/validate-plugin.ts` - Validation script
- `commands/build.md` - Main workflow command
- `templates/progress.txt.template` - Progress file template
- `README.md` - Usage documentation
- `CHANGELOG.md` - Version history

### Test Files
- None (plugin validation via `bun run validate`)

## Testing Strategy

### Manual Test Cases

1. **Test Case: Plugin Loading**
   - Steps: Start Claude Code with plugin installed
   - Expected: `/workflows:build` command available

2. **Test Case: Progress File Creation**
   - Steps: Run `/workflows:build research/test.md`
   - Expected: `.workflow-progress.txt` created with correct format

3. **Test Case: Signal Emission**
   - Steps: Run workflow and check output
   - Expected: `<phase>SETUP_COMPLETE</phase>` etc. appear in output

4. **Test Case: Resume**
   - Steps: Run workflow, interrupt, run with `--continue`
   - Expected: Resumes from last checkpoint

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Slash command invocation fails | Low | High | Use exact command syntax from existing plugins |
| Progress file corruption | Low | Medium | Write atomically, validate on read |

## Rollback Strategy

### Rollback Steps
1. Remove plugin from `~/.claude/plugins/`
2. Restart Claude Code

### Rollback Conditions
- Plugin causes Claude Code errors
- Commands conflict with existing plugins

## Validation Commands

```bash
# Validate plugin structure
cd workflows-plugin && bun run validate

# Verify plugin loads (manual)
# Restart Claude Code and check /workflows:build is available
```

## Acceptance Criteria

- [ ] Plugin.json valid and passes validation
- [ ] `/workflows:build` command available in Claude Code
- [ ] Progress file created with correct format
- [ ] Phase signals emitted correctly
- [ ] `--continue` flag resumes from checkpoint
- [ ] README documents usage

## Dependencies

### New Dependencies
- `zod@^3.22.0` - Schema validation for plugin.json

## Notes & Context

### Assumptions
- User has existing plugins (sdlc, github, primitives) installed
- User has `gh` CLI authenticated
- User has `bun` installed

### Constraints
- Must work with existing plugin architecture
- Cannot modify other plugins

### Related Tasks/Issues
- Plan 2: Plan splitting system
- Plan 3: Comment resolution system
- Plan 4: Shell scripts integration

### References
- Research: `research/research-autonomous-workflow-build.md`
- Ralph pattern: https://www.aihero.dev/getting-started-with-ralph

### Open Questions
- [ ] None - research resolved all design questions
