---
title: "Workflows Plugin - Plan Splitting System"
type: Feature
issue: null
research: [research/research-autonomous-workflow-build.md]
status: Draft
created: 2026-01-25
depends_on: [plan-1-plugin-scaffold-and-build-command.md]
---

# PRD: Workflows Plugin - Plan Splitting System

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 4/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
Large research documents need to be split into multiple implementation plans, each bounded by complexity (max 5/10) to fit within a single Claude Code context window. Manual splitting is error-prone and doesn't account for task dependencies.

### Goals & Objectives
1. Implement `plan-split` skill with complexity scoring algorithm
2. Create `plan-splitter` agent for research analysis
3. Ensure plans respect dependency ordering
4. Generate standardized plan files with proper frontmatter

### Success Metrics
- **Primary Metric**: Research document correctly split into N plans
- **Secondary Metrics**:
  - Each plan complexity ≤ 5/10
  - Dependencies correctly ordered
  - All tasks from research included
- **Quality Gates**: Generated plans pass validation

## User Stories

### Story 1: Automatic Plan Generation
- **As a**: Workflow system
- **I want**: Research automatically split into implementation plans
- **So that**: Each plan fits in context window and respects dependencies
- **Acceptance Criteria**:
  - [ ] Research parsed and tasks identified
  - [ ] Tasks scored for complexity
  - [ ] Tasks grouped into plans (sum ≤ 5)
  - [ ] Plan files generated with proper format

## Requirements

### Functional Requirements

1. **FR-1**: Complexity Scoring
   - Details: Score tasks 1-10 based on files touched, new vs modify, deps, tests, risk
   - Priority: Must Have

2. **FR-2**: Task Grouping
   - Details: Group tasks into plans with total complexity ≤ 5
   - Priority: Must Have

3. **FR-3**: Dependency Ordering
   - Details: Prerequisite tasks in earlier plans
   - Priority: Must Have

4. **FR-4**: Plan Generation
   - Details: Generate `plans/workflow-{n}-{slug}.md` files
   - Priority: Must Have

### Technical Requirements

- **Complexity Scoring Formula**:
  - Files touched: 1-3 files = 1pt, 4-6 = 2pt, 7+ = 3pt
  - New vs modify: New = 1pt, Modify existing = 2pt
  - External deps: None = 0pt, New deps = 2pt
  - Test coverage: Simple = 1pt, Complex = 2pt
  - Risk level: Low = 0pt, Medium = 1pt, High = 2pt

## Scope

### In Scope
- `skills/plan-split/SKILL.md` skill definition
- `agents/plan-splitter.md` agent for analysis
- Complexity scoring algorithm
- Plan file generation

### Out of Scope
- CI resolution
- Comment resolution
- Shell scripts

## Implementation Plan

### Phase 1: Plan Splitter Agent
**Complexity**: 2 | **Priority**: High

- [ ] Create `agents/plan-splitter.md` with:
  - Model: sonnet
  - Tools: Read, Glob, Grep
  - Instructions for research analysis
  - Complexity scoring guidelines
  - Output format specification

### Phase 2: Plan Split Skill
**Complexity**: 2 | **Priority**: High

- [ ] Create `skills/plan-split/SKILL.md` with:
  - Skill invocation pattern
  - Complexity scoring table
  - Grouping algorithm description
  - Plan file template
  - GitHub issue creation trigger

### Phase 3: Integration
**Complexity**: 1 | **Priority**: High

- [ ] Update `commands/build.md` Phase 2 to invoke plan-split skill
- [ ] Test end-to-end plan generation

## Relevant Files

### Existing Files
- `sdlc-plugin/commands/plan.md` - Plan format reference
- `github-plugin/commands/create-issue-from-plan.md` - Issue creation

### New Files
- `skills/plan-split/SKILL.md` - Plan splitting skill
- `agents/plan-splitter.md` - Research analysis agent

## Acceptance Criteria

- [ ] Complexity scoring matches formula
- [ ] All plans have complexity ≤ 5
- [ ] Dependencies correctly ordered
- [ ] Plan files have correct frontmatter
- [ ] GitHub issues created for each plan

## Notes & Context

### References
- Research spec: Section "Skill: plan-split"
