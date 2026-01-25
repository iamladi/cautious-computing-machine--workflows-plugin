---
title: "Workflow Plan 5: Orchestration & E2E Testing"
type: Feature
issue: 8
research: [research-workflows-tdd-migration-deep.md]
status: Draft
created: 2026-01-25
depends_on: [4]
---

# PRD: Orchestration & E2E Testing

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 5/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
With core logic and adapters in place, we need workflow orchestration to tie everything together, plus comprehensive E2E tests to validate the full system.

### Goals & Objectives
1. Implement XState state machine for phase orchestration
2. Implement Effect services for polling/retries with deterministic time testing
3. Wire components with dependency injection
4. Write E2E tests for critical user workflows

### Success Metrics
- **Primary Metric**: Full workflow executes end-to-end
- **Quality Gates**: XState machine covers all phases, E2E tests pass

## Tasks Included

### Task 1: XState state machine for phases
**Complexity**: 2/10

- **Files touched**: src/workflows/main.workflow.ts, tests/integration/workflows/main.test.ts
- **Type**: New files
- **Dependencies**: Plan 4 (adapters available)
- **Description**: XState machine orchestrating Setup → Planning → Implementation → Verification → Completion

### Task 2: Effect services for polling/retries
**Complexity**: 2/10

- **Files touched**: src/services/ci-poller.service.ts, src/services/retry.service.ts, tests/unit/services/
- **Type**: New files
- **Dependencies**: Task 1
- **Description**: Effect-TS services with TestClock for deterministic time-based testing

### Task 3: Dependency injection wiring
**Complexity**: 1/10

- **Files touched**: src/index.ts, src/container.ts
- **Type**: New files
- **Dependencies**: Tasks 1-2
- **Description**: Wire all components, expose public API

## Implementation Plan

### Phase 1: XState Orchestration
**Complexity**: 2/10 | **Priority**: High

- [ ] Add xstate dependency
- [ ] Create src/workflows/main.workflow.ts with state machine
- [ ] Define states: setup, planning, implementing, verifying, completed, failed
- [ ] Implement invoke for async operations
- [ ] Create tests/integration/workflows/main.test.ts

### Phase 2: Effect Services
**Complexity**: 2/10 | **Priority**: High

- [ ] Add effect dependency
- [ ] Create src/services/ci-poller.service.ts with polling logic
- [ ] Create src/services/retry.service.ts with exponential backoff
- [ ] Create unit tests with TestClock for instant time manipulation

### Phase 3: Final Wiring
**Complexity**: 1/10 | **Priority**: Medium

- [ ] Create src/container.ts for dependency injection
- [ ] Create src/index.ts as public API entry point
- [ ] Export createWorkflowRunner factory function
- [ ] Create tests/e2e/full-workflow.e2e.test.ts

## Dependencies

### Plan Dependencies
- **Depends on**: Plan 4 (Real Adapters)
- **Blocks**: None (final plan)

### Task Dependencies
- Task 1 → Task 2 → Task 3 (sequential)

## Acceptance Criteria

- [ ] XState machine handles all phase transitions
- [ ] Effect services test with deterministic time (no flaky tests)
- [ ] Public API allows injecting mock or real adapters
- [ ] E2E test runs full workflow against test fixtures
- [ ] Documentation updated with usage examples

## Notes & Context

### Research Source
- File: `research/research-workflows-tdd-migration-deep.md`
- Sections: Migration Roadmap Phase 4 (Orchestration) + Phase 5 (E2E)
- Patterns: XState (Section 2.2), Effect-TS (Section 2.3)

### XState Code Reference
From research Section 2.2:
```typescript
const workflowMachine = createMachine({
  id: 'ciWorkflow',
  initial: 'setup',
  states: {
    setup: { on: { START: 'planning' } },
    planning: {
      invoke: {
        src: 'generatePlan',
        onDone: { target: 'implementing', actions: assign({ plan: (_, event) => event.data }) },
        onError: 'failed',
      },
    },
    // ...
  },
});
```

### Effect-TS TestClock Reference
From research Section 2.3:
```typescript
import { Effect, TestClock, Duration } from 'effect';

describe('CI Polling', () => {
  it('should poll every 30 seconds', async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(pollCI);
      yield* TestClock.adjust(Duration.seconds(30));
      const result = yield* Fiber.join(fiber);
      return result;
    });
  });
});
```

### Related Plans
- Previous: `plans/workflow-4-adapters.md`
- Next: None (final plan)
