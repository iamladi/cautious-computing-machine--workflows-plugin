---
title: "Workflow Plan 3: Error Detection & Phase Transitions"
type: Feature
issue: 6
research: [research-workflows-tdd-migration-deep.md]
status: Draft
created: 2026-01-25
depends_on: [2]
---

# PRD: Error Detection & Phase Transitions

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 5/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
The shell scripts have stuck detection logic and phase transition handling scattered throughout. This plan ports that logic to pure TypeScript functions with comprehensive test coverage.

### Goals & Objectives
1. Port error detection logic (hash-based stuck detection)
2. Implement phase transition management
3. Configure and achieve 80%+ unit test coverage threshold

### Success Metrics
- **Primary Metric**: All core logic ported with full test coverage
- **Quality Gates**: 80%+ coverage, all transitions tested

## Tasks Included

### Task 1: Port error detection logic
**Complexity**: 2/10

- **Files touched**: src/core/error-detector.ts, tests/unit/core/error-detector.test.ts
- **Type**: New files
- **Dependencies**: Plan 2 (mock adapters available)
- **Description**: Hash-based stuck detection from ci-ralph.sh detect_stuck function

### Task 2: Port phase transitions
**Complexity**: 2/10

- **Files touched**: src/core/phase-manager.ts, tests/unit/core/phase-manager.test.ts
- **Type**: New files
- **Dependencies**: Task 1
- **Description**: Phase orchestration logic: Setup → Planning → Implementation → Verification → Completion

### Task 3: Configure coverage thresholds
**Complexity**: 1/10

- **Files touched**: vitest.config.ts
- **Type**: Modify
- **Dependencies**: Tasks 1-2
- **Description**: Enable coverage thresholds, verify 80%+ achieved

## Implementation Plan

### Phase 1: Error Detection
**Complexity**: 2/10 | **Priority**: High

- [ ] Create src/core/error-detector.ts with hashError and detectStuck functions
- [ ] Create tests/unit/core/error-detector.test.ts
- [ ] Test: first error not stuck, identical errors trigger stuck, different error resets

### Phase 2: Phase Transitions
**Complexity**: 2/10 | **Priority**: High

- [ ] Create src/core/phase-manager.ts with Phase type and transitions
- [ ] Implement: canTransition, transition, getCurrentPhase functions
- [ ] Create tests/unit/core/phase-manager.test.ts
- [ ] Test all valid transitions and invalid transition rejection

### Phase 3: Coverage Threshold
**Complexity**: 1/10 | **Priority**: Medium

- [ ] Update vitest.config.ts with coverage configuration
- [ ] Set thresholds: lines: 80, functions: 80, branches: 80
- [ ] Run `bun run test:coverage` and verify passing

## Dependencies

### Plan Dependencies
- **Depends on**: Plan 2 (Testing Infrastructure)
- **Blocks**: Plan 4 (Adapters Implementation)

### Task Dependencies
- Tasks 1, 2 are independent (can parallelize)
- Task 3 depends on Tasks 1 & 2

## Acceptance Criteria

- [ ] detectStuck returns isStuck: true after 3 identical errors
- [ ] detectStuck resets counter when error changes
- [ ] Phase transitions follow valid state machine
- [ ] Invalid transitions throw descriptive errors
- [ ] Coverage at 80%+ for core/ directory

## Notes & Context

### Research Source
- File: `research/research-workflows-tdd-migration-deep.md`
- Sections: Migration Roadmap Phase 2 (Tasks 6, 7, 8)
- Example: Section 4 - Complete Migration Example: Stuck Detection

### Shell Script Reference
From ci-ralph.sh:
```bash
detect_stuck() {
  local error_hash=$(echo "$1" | md5)
  if [[ "$error_hash" == "$LAST_ERROR_HASH" ]]; then
    STUCK_COUNT=$((STUCK_COUNT + 1))
    if [[ $STUCK_COUNT -ge 3 ]]; then
      echo "Detected stuck: same error 3 times"
      return 0
    fi
  else
    STUCK_COUNT=0
  fi
  LAST_ERROR_HASH=$error_hash
  return 1
}
```

### Related Plans
- Previous: `plans/workflow-2-testing-infrastructure.md`
- Next: `plans/workflow-4-adapters.md`
