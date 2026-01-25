---
title: "Workflows Plugin - Comment Resolution System"
type: Feature
issue: null
research: [research/research-autonomous-workflow-build.md]
status: Draft
created: 2026-01-25
depends_on: [plan-1-plugin-scaffold-and-build-command.md]
---

# PRD: Workflows Plugin - Comment Resolution System

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 4/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
Current `/github:address-pr-comments` sometimes misses comments or doesn't handle reviewer back-and-forth. The workflow needs a dedicated system that ensures ALL comments are either fixed or have explicit replies, and can handle multiple rounds of reviewer feedback.

### Goals & Objectives
1. Implement `comment-resolution` skill with exhaustive comment handling
2. Create `comment-resolver` agent for comment analysis
3. Ensure every comment gets resolution (fix or reply)
4. Handle reviewer back-and-forth until agreement

### Success Metrics
- **Primary Metric**: 0 unaddressed comments after completion
- **Secondary Metrics**:
  - All actionable comments fixed with code changes
  - All non-actionable comments have explanatory replies
  - Reviewer conversations resolved
- **Quality Gates**: No pending review requests

## User Stories

### Story 1: Complete Comment Resolution
- **As a**: Workflow system
- **I want**: Every PR comment addressed without exception
- **So that**: PR is ready for merge without manual follow-up
- **Acceptance Criteria**:
  - [ ] All file/line comments processed
  - [ ] All review comments processed
  - [ ] All issue comments processed
  - [ ] Each has either fix or reply

### Story 2: Reviewer Conversation Handling
- **As a**: Workflow system
- **I want**: Handle reviewer responses to my replies
- **So that**: Conversations reach resolution
- **Acceptance Criteria**:
  - [ ] Detect new replies to existing threads
  - [ ] Re-evaluate and respond appropriately
  - [ ] Loop until no new comments

## Requirements

### Functional Requirements

1. **FR-1**: Exhaustive Comment Fetching
   - Details: Fetch ALL comment types (review, file, issue)
   - Priority: Must Have

2. **FR-2**: Comment Categorization
   - Details: Categorize as actionable/clear, actionable/unclear, not-actionable
   - Priority: Must Have

3. **FR-3**: Fix Application
   - Details: Apply code fixes and reply "Fixed in {sha}"
   - Priority: Must Have

4. **FR-4**: Explanation Replies
   - Details: Post explanatory replies for non-fixes
   - Priority: Must Have

5. **FR-5**: Conversation Tracking
   - Details: Track and re-process threads with new replies
   - Priority: Must Have

### Technical Requirements

- **GitHub API Endpoints**:
  - `GET repos/{owner}/{repo}/pulls/{pr}/comments` - File comments
  - `GET repos/{owner}/{repo}/pulls/{pr}/reviews` - Review comments
  - `GET repos/{owner}/{repo}/issues/{pr}/comments` - Issue comments
  - `POST repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies` - Reply

## Scope

### In Scope
- `skills/comment-resolution/SKILL.md` skill definition
- `agents/comment-resolver.md` agent for analysis
- Comment fetching and categorization
- Fix application workflow
- Reply posting workflow

### Out of Scope
- CI resolution
- Plan splitting
- Shell scripts

## Implementation Plan

### Phase 1: Comment Resolver Agent
**Complexity**: 2 | **Priority**: High

- [ ] Create `agents/comment-resolver.md` with:
  - Model: sonnet
  - Tools: Read, Edit, Bash (for gh API)
  - Comment categorization logic
  - Fix vs reply decision tree
  - Reply templates

### Phase 2: Comment Resolution Skill
**Complexity**: 2 | **Priority**: High

- [ ] Create `skills/comment-resolution/SKILL.md` with:
  - Comment fetching commands
  - Processing loop logic
  - Fix application workflow
  - Reply posting workflow
  - Completion criteria (0 pending)
  - Signal: `<phase>COMMENTS_RESOLVED</phase>`

### Phase 3: Integration
**Complexity**: 1 | **Priority**: High

- [ ] Create `commands/resolve-comments.md` for direct invocation
- [ ] Wire into shell script workflow

## Relevant Files

### Existing Files
- `github-plugin/commands/address-pr-comments.md` - Existing comment handling
- `github-plugin/agents/ci-error-fixer.md` - Fix application pattern

### New Files
- `skills/comment-resolution/SKILL.md` - Comment resolution skill
- `agents/comment-resolver.md` - Comment analysis agent
- `commands/resolve-comments.md` - Direct command

## Acceptance Criteria

- [ ] All comment types fetched
- [ ] Comments correctly categorized
- [ ] Actionable comments fixed with code changes
- [ ] Non-actionable comments have replies
- [ ] New replies trigger re-processing
- [ ] Completion signal emitted

## Notes & Context

### Reply Templates
- **Fixed**: "Fixed in {commit-sha}"
- **Intentional**: "This is intentional because {reason}"
- **Out of scope**: "Out of scope for this PR - will address in follow-up: {issue-url}"
- **Clarification needed**: "Could you clarify what specific change you're looking for?"

### References
- Research spec: Section "Skill: comment-resolution"
