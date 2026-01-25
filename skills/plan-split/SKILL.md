---
name: plan-split
description: Orchestrates plan-splitting workflow that analyzes research documents and generates multiple implementation plans bounded by complexity (≤ 5). Each plan respects dependency ordering and triggers GitHub issue creation.
---

# Plan Split Skill

Automatically split large research documents into multiple implementation plans, each bounded by complexity to fit within Claude Code's context window.

## When to Use

- After research is complete and needs to be broken into implementation plans
- When a feature is too large for a single plan (complexity > 5)
- As part of the autonomous workflow build system
- When you need dependency-ordered implementation phases

## Invocation Pattern

```
/workflows:plan-split research/my-feature.md
```

or programmatically:

```
Skill(workflows:plan-split, args: "research/feature-name.md")
```

## Arguments

The skill expects a research file path:
- `$ARGUMENTS` - Path to research document (e.g., `research/my-feature.md`)

If no path provided, prompt the user to specify one.

## Workflow

### Step 1: Validate Research File

Check that the research file exists and is readable:

```bash
# Verify file exists
test -f "$RESEARCH_FILE" && echo "found" || echo "not-found"
```

If not found, stop with error: "Research file not found: $RESEARCH_FILE"

### Step 2: Invoke Plan Splitter Agent

Dispatch the `plan-splitter` agent to analyze the research document:

```
Agent(workflows:plan-splitter, research_file: "$ARGUMENTS")
```

The agent will:
1. Read the research document
2. Extract all tasks and implementation phases
3. Score each task using the complexity formula
4. Identify task dependencies
5. Group tasks into plans with complexity ≤ 5

### Step 3: Complexity Scoring Reference

The agent uses this standardized scoring formula:

| Factor | Low | Medium | High |
|--------|-----|--------|------|
| **Files touched** | 1-3 files = 1pt | 4-6 files = 2pt | 7+ files = 3pt |
| **New vs modify** | New file = 1pt | Modify existing = 2pt | N/A |
| **External deps** | None = 0pt | New deps = 2pt | N/A |
| **Test coverage** | Simple = 1pt | Complex = 2pt | N/A |
| **Risk level** | Low = 0pt | Medium = 1pt | High = 2pt |

**Example Scoring:**
```
Task: "Create agents/plan-splitter.md"
- Files touched: 1 file → 1pt
- New vs modify: New file → 1pt
- External deps: None → 0pt
- Test coverage: Simple → 1pt
- Risk level: Low → 0pt
Total: 3pts (Low complexity)
```

### Step 4: Task Grouping Algorithm

Tasks are grouped into plans following these rules:

1. **Complexity Constraint**: Each plan's total complexity must be ≤ 5
2. **Dependency Ordering**: Prerequisites must appear in earlier plans
3. **Logical Cohesion**: Related tasks grouped when possible

**Algorithm:**
1. Start with tasks that have no dependencies
2. Add tasks to current plan until next task would exceed complexity limit
3. Create new plan when threshold would be exceeded
4. Ensure dependent tasks appear in later plans only

**Example Grouping:**
```
Given tasks:
- Task A: 2pts (no deps)
- Task B: 2pts (no deps)
- Task C: 3pts (depends on A, B)
- Task D: 1pt (no deps)

Result:
Plan 1: Task A (2pts) + Task B (2pts) = 4pts
Plan 2: Task C (3pts) + Task D (1pt) = 4pts
```

### Step 5: Generate Plan Files

For each plan group, create a plan file following the SDLC plugin format:

**Filename Pattern:** `plans/workflow-{n}-{slug}.md`
- `{n}`: Sequential plan number (1, 2, 3...)
- `{slug}`: URL-safe description (e.g., `foundation-setup`, `core-implementation`)

**Plan File Template:**

```markdown
---
title: "Workflow Plan {n}: {Descriptive Title}"
type: Feature
issue: null
research: [{research-file-name}.md]
status: Draft
created: {YYYY-MM-DD}
depends_on: {previous-plan-numbers or null}
---

# PRD: {Descriptive Title}

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: {total-complexity}/10
- **Created**: {YYYY-MM-DD}
- **Status**: Draft

## Overview

### Problem Statement
{What this plan implements from the research}

### Goals & Objectives
{What tasks are included and their purpose}

### Success Metrics
- **Primary Metric**: {Main success criteria}
- **Quality Gates**: All tasks completed, tests passing

## Tasks Included

### Task 1: {Task Name}
**Complexity**: {X}/10

- **Files touched**: {list}
- **Type**: {New/Modify}
- **Dependencies**: {task IDs or None}
- **Description**: {what this task does}

### Task 2: {Task Name}
**Complexity**: {X}/10

[...repeat for all tasks in this plan]

## Implementation Plan

### Phase 1: {Task Group Name}
**Complexity**: {X}/10 | **Priority**: High

- [ ] {Task 1 from group}
- [ ] {Task 2 from group}

[...additional phases as needed]

## Dependencies

### Plan Dependencies
- **Depends on**: {Plan 1, Plan 2} or None
- **Blocks**: {Plan 4, Plan 5} or None

### Task Dependencies
- Task 1 → Task 3
- Task 2 → Task 3

## Acceptance Criteria

- [ ] All tasks in this plan completed
- [ ] Tests passing for new/modified code
- [ ] No regressions in existing functionality
- [ ] Complexity within limit (≤ 5)

## Notes & Context

### Research Source
- File: `{research-file-path}`
- Original complexity: {total-research-complexity}
- Split into: {N} plans

### Related Plans
- Previous: `{plan-file-name}` or None
- Next: `{plan-file-name}` or None
```

### Step 6: Create GitHub Issues

For each generated plan file, invoke the GitHub plugin to create an issue:

```
/github:create-issue-from-plan plans/workflow-{n}-{slug}.md
```

This will:
1. Create a GitHub issue with the plan summary
2. Add implementation phases as a checklist
3. Update the plan's frontmatter with `issue: {number}`
4. Return the issue URL

**After issue creation**, update each plan file's frontmatter:

```markdown
---
issue: 123
---
```

### Step 7: Final Report

Provide a summary of the plan-splitting operation:

```
Plan Splitting Complete

Research Source: research/{research-name}.md
Total Tasks: {count}
Total Research Complexity: {sum}

Generated Plans:
  1. plans/workflow-1-{slug}.md (Complexity: 4/10, Issue: #{issue-num})
  2. plans/workflow-2-{slug}.md (Complexity: 5/10, Issue: #{issue-num})
  3. plans/workflow-3-{slug}.md (Complexity: 3/10, Issue: #{issue-num})

Dependency Chain:
  Plan 1 → Plan 2 → Plan 3

Next Steps:
  1. Review generated plans for accuracy
  2. Implement plans in dependency order
  3. Track progress via GitHub issues
```

## Idempotency

This skill is safe to re-run:
- Detects existing plan files and skips regeneration (or prompts for overwrite)
- GitHub issue creation is idempotent (won't create duplicates)
- Plan analysis is deterministic given same research input

## Error Handling

| Error | Action |
|-------|--------|
| Research file not found | Stop with clear error message |
| Invalid research format | Report parsing issues, request manual review |
| Circular dependencies detected | Flag issue, recommend restructuring research |
| Single task complexity > 5 | Flag for manual splitting, don't auto-generate |
| GitHub API error | Report issue creation failure, continue with next plan |

## Integration with Build Workflow

When invoked from `/workflows:build`:
- Receives research file path from Phase 1 output
- Generates plans and issues
- Returns list of plan files for Phase 3 (implementation)
- Propagates any errors/warnings to parent workflow

## Example Usage

**Manual invocation:**
```
/workflows:plan-split research/autonomous-workflow-build.md
```

**Expected output:**
```
Analyzing research document...

Found 6 tasks with total complexity: 13/10

Task Breakdown:
  1. Create plugin scaffold (3pts)
  2. Create build command (2pts)
  3. Create plan-splitter agent (2pts)
  4. Create plan-split skill (2pts)
  5. Create implement-plan skill (3pts)
  6. Add CI resolution (1pt)

Grouping into plans...

Plan 1: Foundation & Scaffold (Complexity: 5/10)
  - Task 1: Plugin scaffold (3pts)
  - Task 2: Build command (2pts)

Plan 2: Plan Splitting System (Complexity: 4/10)
  - Task 3: Plan-splitter agent (2pts)
  - Task 4: Plan-split skill (2pts)

Plan 3: Implementation & CI (Complexity: 4/10)
  - Task 5: Implement-plan skill (3pts)
  - Task 6: CI resolution (1pt)

Generating plan files...
  ✓ plans/workflow-1-foundation-scaffold.md
  ✓ plans/workflow-2-plan-splitting-system.md
  ✓ plans/workflow-3-implementation-ci.md

Creating GitHub issues...
  ✓ Issue #123 created for Plan 1
  ✓ Issue #124 created for Plan 2
  ✓ Issue #125 created for Plan 3

Plan splitting complete. 3 plans generated from 6 tasks.
```

## Quality Checks

Before completing, verify:
- [ ] All tasks from research included in plans
- [ ] No plan exceeds complexity limit (5)
- [ ] Dependencies correctly ordered
- [ ] Plan files have valid frontmatter
- [ ] GitHub issues created successfully
- [ ] Issue numbers updated in plan frontmatter

## What NOT to Do

- Don't modify the research document during splitting
- Don't add tasks not present in research
- Don't violate dependency ordering to balance plan sizes
- Don't create plans with complexity > 5
- Don't skip GitHub issue creation
- Don't guess at complexity scores - follow the formula strictly
