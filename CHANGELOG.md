# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
