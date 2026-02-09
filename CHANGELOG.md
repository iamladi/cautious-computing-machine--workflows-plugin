# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-09

### Added

- **`--swarm` flag for `/workflows:comment-resolution`** — parallel file-partitioned comment resolution
  - Comments partitioned by file path; general comments handled by lead
  - Spawns one teammate per file group (max 5, batched by directory if >5)
  - Cross-file impact sharing via SendMessage
  - Lead collects edits, commits in controlled order, posts all replies
  - Enhanced final report with team statistics
  - Feature flag validation with graceful fallback to sequential mode
  - Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

## [0.1.0] - 2026-01-25

### Added
- Initial plugin scaffold with standard Claude Code plugin structure
- `/workflows:build` command for orchestrating the full SDLC pipeline
- Progress file tracking with `.workflow-progress.txt`
- Phase signals for external script coordination:
  - `<phase>SETUP_COMPLETE</phase>`
  - `<phase>PLANNING_COMPLETE</phase>`
  - `<phase>IMPLEMENTATION_COMPLETE</phase>`
  - `<phase>SUBMISSION_COMPLETE</phase>`
  - `<phase>WORKFLOW_COMPLETE</phase>`
- `--continue` flag for resumable workflows
- Progress file template in `templates/progress.txt.template`
- Plugin validation scripts
