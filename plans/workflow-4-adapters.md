---
title: "Workflow Plan 4: Real Adapters Implementation"
type: Feature
issue: 7
research: [research-workflows-tdd-migration-deep.md]
status: Draft
created: 2026-01-25
depends_on: [3]
---

# PRD: Real Adapters Implementation

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 5/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
With core logic tested, we need real adapters that interact with external systems (GitHub CLI, Claude CLI, process spawning). These form the Imperative Shell layer of our architecture.

### Goals & Objectives
1. Implement GitHub CLI adapter with streaming JSON support
2. Implement Claude CLI adapter for AI interactions
3. Write integration tests for adapter behavior
4. Validate against real GitHub repositories

### Success Metrics
- **Primary Metric**: Adapters successfully call real CLIs
- **Quality Gates**: Integration tests pass, streaming works correctly

## Tasks Included

### Task 1: GitHub CLI adapter with streaming
**Complexity**: 3/10

- **Files touched**: src/adapters/github-cli.adapter.ts, tests/integration/adapters/github-cli.test.ts, package.json
- **Type**: New files + modify
- **Dependencies**: Plan 3 (coverage achieved)
- **Description**: Real GitHub CLI adapter using execa and ndjson for streaming JSON

### Task 2: Claude CLI adapter
**Complexity**: 2/10

- **Files touched**: src/adapters/claude-cli.adapter.ts, tests/integration/adapters/claude-cli.test.ts
- **Type**: New files
- **Dependencies**: Task 1 (execa already added)
- **Description**: Adapter for Claude CLI interactions with streaming response handling

## Implementation Plan

### Phase 1: GitHub Adapter
**Complexity**: 3/10 | **Priority**: High

- [ ] Add dependencies: execa, ndjson (or @streamparser/json)
- [ ] Create src/adapters/github-cli.adapter.ts implementing IGitHubClient
- [ ] Implement getCIStatus, getComments, pollUntilComplete
- [ ] Handle streaming JSON output from `gh` commands
- [ ] Create tests/integration/adapters/github-cli.test.ts

### Phase 2: Claude Adapter
**Complexity**: 2/10 | **Priority**: High

- [ ] Create src/adapters/claude-cli.adapter.ts implementing IClaudeClient
- [ ] Implement runPrompt, streamResponse methods
- [ ] Handle Claude CLI streaming output
- [ ] Create tests/integration/adapters/claude-cli.test.ts

## Dependencies

### Plan Dependencies
- **Depends on**: Plan 3 (Error Detection & Phases)
- **Blocks**: Plan 5 (Orchestration & E2E)

### Task Dependencies
- Task 1 (GitHub) before Task 2 (Claude) - shared execa dependency

## Acceptance Criteria

- [ ] GitHub adapter executes `gh run view` successfully
- [ ] GitHub adapter parses streaming JSON output
- [ ] Claude adapter executes `claude` CLI commands
- [ ] Integration tests run against real CLIs (skippable in CI)
- [ ] Adapter errors are properly typed and descriptive

## Notes & Context

### Research Source
- File: `research/research-workflows-tdd-migration-deep.md`
- Sections: Migration Roadmap Phase 3 (Tasks 9-12)
- Pattern: Hexagonal Architecture Adapters (Section 1.2)

### Code Reference
From research Section 1.2:
```typescript
// ADAPTER - Real implementation
class GitHubCLIAdapter implements IGitHubClient {
  async getCIStatus(run: number): Promise<CIStatus> {
    const result = await execa('gh', ['run', 'view', run.toString(), '--json', 'status']);
    return JSON.parse(result.stdout);
  }
}
```

### Streaming JSON Pattern
From research Section 3.2:
```typescript
import ndjson from 'ndjson';

async *streamCIRuns(query: string): AsyncGenerator<CIRun> {
  const process = execa('gh', ['run', 'list', '--json', 'status', '--jq', '.[]']);
  const parser = ndjson.parse();
  process.stdout!.pipe(parser);
  for await (const obj of parser) {
    yield obj as CIRun;
  }
}
```

### Related Plans
- Previous: `plans/workflow-3-error-detection-phases.md`
- Next: `plans/workflow-5-orchestration-e2e.md`
