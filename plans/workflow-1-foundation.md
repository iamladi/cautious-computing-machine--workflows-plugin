---
title: "Workflow Plan 1: Foundation Setup"
type: Feature
issue: 4
research: [research-workflows-tdd-migration-deep.md]
status: Draft
created: 2026-01-25
depends_on: null
---

# PRD: Foundation Setup

## Metadata
- **Type**: Feature
- **Priority**: High
- **Estimated Complexity**: 5/10
- **Created**: 2026-01-25
- **Status**: Draft

## Overview

### Problem Statement
The workflows-plugin currently uses shell scripts (ci-ralph.sh, workflow-ralph.sh, comments-ralph.sh) that are difficult to test. This plan establishes the TypeScript foundation with Vitest testing framework and Hexagonal Architecture ports/adapters pattern.

### Goals & Objectives
1. Set up TypeScript project with Vitest for TDD-enabled development
2. Define port interfaces for external dependencies (GitHub, Claude, Process)
3. Implement mock adapters for testing without external dependencies
4. Write initial unit tests demonstrating the testing pattern

### Success Metrics
- **Primary Metric**: All foundation files created, tests passing
- **Quality Gates**: TypeScript compiles, Vitest runs, mock adapters work

## Tasks Included

### Task 1: Set up TypeScript project with Vitest
**Complexity**: 3/10

- **Files touched**: package.json, vitest.config.ts, tsconfig.json
- **Type**: Modify existing + New files
- **Dependencies**: None
- **Description**: Add Vitest, TypeScript strict mode, configure test scripts

### Task 2: Define ports (interfaces)
**Complexity**: 2/10

- **Files touched**: src/ports/github.port.ts, src/ports/claude.port.ts, src/ports/process.port.ts
- **Type**: New files
- **Dependencies**: Task 1
- **Description**: Define TypeScript interfaces following Hexagonal Architecture pattern

## Implementation Plan

### Phase 1: Project Setup
**Complexity**: 3/10 | **Priority**: High

- [ ] Update package.json with Vitest, TypeScript dependencies
- [ ] Create tsconfig.json with strict settings
- [ ] Create vitest.config.ts with test configuration
- [ ] Add test script to package.json

### Phase 2: Port Interfaces
**Complexity**: 2/10 | **Priority**: High

- [ ] Create src/ports/github.port.ts with IGitHubClient interface
- [ ] Create src/ports/claude.port.ts with IClaudeClient interface
- [ ] Create src/ports/process.port.ts with IProcessRunner interface
- [ ] Create src/ports/index.ts barrel export

## Dependencies

### Plan Dependencies
- **Depends on**: None
- **Blocks**: Plan 2 (Testing Infrastructure)

### Task Dependencies
- Task 1 (project setup) must complete before Task 2 (ports)

## Acceptance Criteria

- [ ] `bun run test` executes successfully (even with no tests yet)
- [ ] TypeScript compiles with zero errors
- [ ] All port interfaces defined with proper typing
- [ ] Vitest configuration includes coverage setup

## Notes & Context

### Research Source
- File: `research/research-workflows-tdd-migration-deep.md`
- Section: Migration Roadmap Phase 1 (Foundation)
- Architecture: Hexagonal Architecture with Ports & Adapters

### Related Plans
- Previous: None
- Next: `plans/workflow-2-testing-infrastructure.md`
