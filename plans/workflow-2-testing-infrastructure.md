---
title: "Workflow Plan 2: Testing Infrastructure & Core Logic"
type: Feature
issue: 5
research: [research-workflows-tdd-migration-deep.md]
status: Draft
created: 2026-01-25
depends_on: [1]
---

# PRD: Testing Infrastructure & Core Logic

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 5/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
With ports defined, we need mock adapters for testing and the core pure logic (Functional Core) that handles workflow state and error detection without any external dependencies.

### Goals & Objectives
1. Implement mock adapters that satisfy port interfaces
2. Port workflow state management as pure functions
3. Port error detection logic (hash-based stuck detection)
4. Achieve unit test coverage for all core logic

### Success Metrics
- **Primary Metric**: Core logic tested with zero mocks needed
- **Quality Gates**: All unit tests passing, pure functions have no side effects

## Tasks Included

### Task 1: Implement mock adapters for testing
**Complexity**: 2/10

- **Files touched**: src/adapters/mocks/mock-github.ts, mock-claude.ts, mock-process.ts
- **Type**: New files
- **Dependencies**: Plan 1 (ports defined)
- **Description**: Mock implementations of ports for isolated unit testing

### Task 2: Port workflow state management (pure functions)
**Complexity**: 3/10

- **Files touched**: src/core/workflow-state.ts, tests/unit/core/workflow-state.test.ts
- **Type**: New files
- **Dependencies**: Task 1
- **Description**: Pure state transitions following FCIS pattern from research Section 4

## Implementation Plan

### Phase 1: Mock Adapters
**Complexity**: 2/10 | **Priority**: High

- [ ] Create src/adapters/mocks/mock-github.ts implementing IGitHubClient
- [ ] Create src/adapters/mocks/mock-claude.ts implementing IClaudeClient
- [ ] Create src/adapters/mocks/mock-process.ts implementing IProcessRunner
- [ ] Create src/adapters/mocks/index.ts barrel export

### Phase 2: Core State Management
**Complexity**: 3/10 | **Priority**: High

- [ ] Create src/core/workflow-state.ts with WorkflowState type
- [ ] Implement state transition functions (pure, no side effects)
- [ ] Create tests/unit/core/workflow-state.test.ts
- [ ] Test all state transitions without mocks

## Dependencies

### Plan Dependencies
- **Depends on**: Plan 1 (Foundation Setup)
- **Blocks**: Plan 3 (Error Detection & Phase Transitions)

### Task Dependencies
- Task 1 → Task 2 (mocks needed before core tests)

## Acceptance Criteria

- [ ] Mock adapters implement all port interfaces
- [ ] WorkflowState type covers: setup, planning, implementing, completed, failed
- [ ] State transitions are pure functions (no side effects)
- [ ] Unit tests pass without any external mocks (vi.mock)

## Notes & Context

### Research Source
- File: `research/research-workflows-tdd-migration-deep.md`
- Section: Migration Roadmap Phase 2 (Core Logic)
- Pattern: Functional Core, Imperative Shell (Section 1.1)

### Code Reference
From research Section 4 - Stuck Detection Example:
```typescript
export interface StuckDetectorState {
  lastErrorHash: string | null;
  stuckCount: number;
}

export function detectStuck(
  state: StuckDetectorState,
  currentError: string,
  threshold = 3
): { isStuck: boolean; nextState: StuckDetectorState }
```

### Related Plans
- Previous: `plans/workflow-1-foundation.md`
- Next: `plans/workflow-3-error-detection-phases.md`
