#!/usr/bin/env bash
#
# workflow-ralph.sh - Autonomous workflow orchestrator (AFK Ralph pattern)
#
# The "Ralph Wiggum" pattern: Run and walk away while the workflow completes.
# This script orchestrates the full SDLC pipeline from research to PR submission,
# handling CI failures and comment resolution autonomously.
#
# Features:
#   - Docker sandbox mode for AFK safety (USE_SANDBOX=true)
#   - YOLO mode to skip permission prompts (YOLO_MODE=true)
#   - jq streaming for real-time output
#   - Signal-based completion detection
#
# Usage:
#   ./scripts/workflow-ralph.sh research/my-feature.md
#
#   # Full AFK mode (Docker + YOLO) - default
#   ./workflow-ralph.sh research/my-feature.md
#
#   # No sandbox (faster, less safe)
#   USE_SANDBOX=false ./workflow-ralph.sh research/my-feature.md
#
#   # Interactive mode (keep permission prompts)
#   YOLO_MODE=false ./workflow-ralph.sh research/my-feature.md

set -euo pipefail

# ============================================================================
# AFK Ralph Configuration
# ============================================================================

# Docker sandbox mode (default: enabled for AFK safety)
USE_SANDBOX="${USE_SANDBOX:-true}"

# YOLO mode - skip all permission prompts
YOLO_MODE="${YOLO_MODE:-true}"

# Temp files for signal capture
TMPDIR="${TMPDIR:-/tmp}"
SIGNAL_LOG=""
RESULT_FILE=""

# jq filter for streaming assistant text
JQ_STREAM='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty'

# jq filter for final result
JQ_RESULT='select(.type == "result").result // empty'

# ============================================================================
# Configuration
# ============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly NOTIFICATION_LOG="$HOME/.workflow-notifications.log"
readonly MAX_BUILD_ITERATIONS="${MAX_BUILD_ITERATIONS:-10}"
readonly PROGRESS_FILE=".workflow-progress.txt"
readonly VERBOSE="${VERBOSE:-false}"

# ============================================================================
# Cleanup and Trap Handler
# ============================================================================

cleanup() {
    local exit_code=$?
    echo ""
    echo "Cleaning up..."

    # Remove temp files
    [ -n "$SIGNAL_LOG" ] && [ -f "$SIGNAL_LOG" ] && rm -f "$SIGNAL_LOG"
    [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ] && rm -f "$RESULT_FILE"

    # Stop Docker sandbox if running
    if [ "$USE_SANDBOX" = "true" ]; then
        docker sandbox stop claude 2>/dev/null || true
    fi

    exit $exit_code
}

trap cleanup EXIT SIGINT SIGTERM

# ============================================================================
# Utilities
# ============================================================================

# Log notification with timestamp
notify() {
    local status="$1"
    local workflow_id="$2"
    local stage="$3"
    local message="$4"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    echo "[$timestamp] $status $workflow_id $stage \"$message\"" >> "$NOTIFICATION_LOG"
}

# Print error and exit
error() {
    local message="$1"
    echo "ERROR: $message" >&2
    exit 1
}

# Print usage information
usage() {
    cat <<EOF
Usage: $0 <research-file>

Arguments:
  research-file    Path to research markdown file (e.g., research/my-feature.md)

Example:
  $0 research/my-feature.md

Environment Variables:
  USE_SANDBOX              Docker sandbox mode (default: true)
  YOLO_MODE                Skip permission prompts (default: true)
  MAX_BUILD_ITERATIONS     Max build iterations (default: 10)
  VERBOSE                  Show raw jq output (default: false)

The script will:
  1. Run /workflows:build in a loop until PR is created
  2. Resolve CI failures with ci-ralph.sh
  3. Handle PR comments with comments-ralph.sh
  4. Log progress to $NOTIFICATION_LOG

EOF
    exit 1
}

# ============================================================================
# Claude Invocation Function
# ============================================================================

run_claude() {
    local prompt="$1"
    local capture_file="${2:-}"

    # Build command
    local cmd=""
    if [ "$USE_SANDBOX" = "true" ]; then
        cmd="docker sandbox run --credentials host claude"
    else
        cmd="claude"
    fi

    # Add YOLO mode
    if [ "$YOLO_MODE" = "true" ]; then
        cmd="$cmd --dangerously-skip-permissions"
    fi

    # Add output format
    cmd="$cmd --print --output-format stream-json"

    # Create temp file for capture
    SIGNAL_LOG=$(mktemp "$TMPDIR/ralph-signal.XXXXXX")

    # Execute with streaming + capture
    if [ "$VERBOSE" = "true" ]; then
        eval "$cmd \"$prompt\"" 2>&1 \
            | grep --line-buffered '^{' \
            | tee "$SIGNAL_LOG" \
            | jq --unbuffered -rj "$JQ_STREAM"
    else
        eval "$cmd \"$prompt\"" 2>&1 \
            | grep --line-buffered '^{' \
            | tee "$SIGNAL_LOG" \
            | jq --unbuffered -rj "$JQ_STREAM" 2>/dev/null || true
    fi

    local exit_code=${PIPESTATUS[0]}

    # Extract final result if capture file specified
    if [ -n "$capture_file" ]; then
        jq -r "$JQ_RESULT" "$SIGNAL_LOG" > "$capture_file" 2>/dev/null || true
    fi

    return $exit_code
}

# ============================================================================
# Signal Detection
# ============================================================================

check_completion() {
    local log_file="$1"

    if grep -q '<promise>COMPLETE</promise>' "$log_file" 2>/dev/null; then
        return 0  # Complete
    elif grep -q '<promise>FAILED</promise>' "$log_file" 2>/dev/null; then
        return 1  # Failed
    fi
    return 2  # Continue
}

check_pr_created() {
    local log_file="$1"

    if grep -qE 'PR_CREATED|pull request.*created|<promise>PR_CREATED</promise>' "$log_file" 2>/dev/null; then
        return 0
    fi
    return 1
}

# ============================================================================
# Argument Parsing
# ============================================================================

if [ $# -eq 0 ]; then
    usage
fi

RESEARCH_FILE="$1"

# Validate research file exists
if [ ! -f "$RESEARCH_FILE" ]; then
    error "Research file not found: $RESEARCH_FILE"
fi

# Extract workflow ID from research filename
WORKFLOW_ID=$(basename "$RESEARCH_FILE" .md)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Workflow Ralph - AFK Autonomous Orchestrator"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Research: $RESEARCH_FILE"
echo "Workflow ID: $WORKFLOW_ID"
echo "Sandbox: $USE_SANDBOX"
echo "YOLO Mode: $YOLO_MODE"
echo "Notifications: $NOTIFICATION_LOG"
echo ""

notify "STARTED" "$WORKFLOW_ID" "INIT" "Beginning workflow execution (sandbox=$USE_SANDBOX, yolo=$YOLO_MODE)"

# ============================================================================
# Phase 1: Build Loop (until PR created)
# ============================================================================

echo "Phase 1: Build Loop"
echo "Running /workflows:build until PR is created..."
echo ""

BUILD_COMPLETE=false

for ((i=1; i<=MAX_BUILD_ITERATIONS; i++)); do
    echo ""
    echo "━━━ Build Iteration $i/$MAX_BUILD_ITERATIONS ━━━"

    RESULT_FILE=$(mktemp "$TMPDIR/ralph-result.XXXXXX")

    run_claude "/workflows:build \"$RESEARCH_FILE\" --continue" "$RESULT_FILE" || true

    # Check signals in captured output
    check_completion "$SIGNAL_LOG"
    completion_status=$?

    if [ $completion_status -eq 0 ]; then
        echo ""
        echo "Ralph complete after $i iterations."
        notify "SUCCESS" "$WORKFLOW_ID" "COMPLETE" "Completed in $i iterations"
        BUILD_COMPLETE=true
        break
    elif [ $completion_status -eq 1 ]; then
        echo ""
        echo "Workflow failed signal detected."
        notify "ERROR" "$WORKFLOW_ID" "BUILD" "Workflow failed at iteration $i"
        error "Workflow failed - check logs for details"
    fi

    # Check for PR_CREATED in output
    if check_pr_created "$SIGNAL_LOG"; then
        echo ""
        echo "PR created - moving to CI resolution..."
        BUILD_COMPLETE=true
        break
    fi

    # Clean up temp files from this iteration
    [ -f "$RESULT_FILE" ] && rm -f "$RESULT_FILE"

    echo ""
    echo "Build iteration $i complete, continuing..."
    sleep 2
done

if [ "$BUILD_COMPLETE" = false ]; then
    notify "ERROR" "$WORKFLOW_ID" "BUILD" "Max build iterations reached ($MAX_BUILD_ITERATIONS)"
    error "Maximum build iterations ($MAX_BUILD_ITERATIONS) reached without PR creation"
fi

echo ""
echo "Build phase complete!"
echo ""

# ============================================================================
# Phase 2: Extract PR Number
# ============================================================================

echo "Phase 2: Extract PR Number"
echo "Reading $PROGRESS_FILE for PR information..."
echo ""

# Find the worktree directory from progress file or use default location
WORKTREE_DIR=""

# Try common locations for progress file
if [ -f "$PROGRESS_FILE" ]; then
    WORKTREE_DIR="."
else
    # Search in .worktrees directory
    PROGRESS_PATH=$(find .worktrees -maxdepth 3 -name "$PROGRESS_FILE" 2>/dev/null | head -1)
    if [ -n "$PROGRESS_PATH" ]; then
        WORKTREE_DIR=$(dirname "$PROGRESS_PATH")
    fi
fi

if [ -z "$WORKTREE_DIR" ] || [ ! -f "$WORKTREE_DIR/$PROGRESS_FILE" ]; then
    notify "ERROR" "$WORKFLOW_ID" "PR_EXTRACT" "Progress file not found"
    error "Could not locate $PROGRESS_FILE in worktree"
fi

# Extract PR number from progress file
PR_NUMBER=$(awk '/^## PR/,/^##/ {if (/^number:/) print $2}' "$WORKTREE_DIR/$PROGRESS_FILE" | head -1)

if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" = "null" ]; then
    notify "ERROR" "$WORKFLOW_ID" "PR_EXTRACT" "PR number not found in progress file"
    error "PR number not found in $PROGRESS_FILE"
fi

echo "Extracted PR number: #$PR_NUMBER"
notify "PROGRESS" "$WORKFLOW_ID" "PR_EXTRACT" "PR #$PR_NUMBER identified"
echo ""

# ============================================================================
# Phase 3: CI Resolution
# ============================================================================

echo "Phase 3: CI Resolution"
echo "Calling ci-ralph.sh for PR #$PR_NUMBER..."
echo ""

CI_SCRIPT="$SCRIPT_DIR/ci-ralph.sh"

if [ ! -f "$CI_SCRIPT" ]; then
    echo "Warning: ci-ralph.sh not found at $CI_SCRIPT"
    echo "Skipping CI resolution phase"
    notify "SKIPPED" "$WORKFLOW_ID" "CI_RESOLUTION" "ci-ralph.sh not found"
else
    # Pass environment variables to child script
    if USE_SANDBOX="$USE_SANDBOX" YOLO_MODE="$YOLO_MODE" "$CI_SCRIPT" "$PR_NUMBER"; then
        notify "PROGRESS" "$WORKFLOW_ID" "CI_RESOLUTION" "CI checks passed for PR #$PR_NUMBER"
        echo "CI resolution complete"
    else
        notify "ERROR" "$WORKFLOW_ID" "CI_RESOLUTION" "CI resolution failed for PR #$PR_NUMBER"
        error "CI resolution failed for PR #$PR_NUMBER"
    fi
fi

echo ""

# ============================================================================
# Phase 4: Comment Resolution
# ============================================================================

echo "Phase 4: Comment Resolution"
echo "Calling comments-ralph.sh for PR #$PR_NUMBER..."
echo ""

COMMENTS_SCRIPT="$SCRIPT_DIR/comments-ralph.sh"

if [ ! -f "$COMMENTS_SCRIPT" ]; then
    echo "Warning: comments-ralph.sh not found at $COMMENTS_SCRIPT"
    echo "Skipping comment resolution phase"
    notify "SKIPPED" "$WORKFLOW_ID" "COMMENT_RESOLUTION" "comments-ralph.sh not found"
else
    # Pass environment variables to child script
    if USE_SANDBOX="$USE_SANDBOX" YOLO_MODE="$YOLO_MODE" "$COMMENTS_SCRIPT" "$PR_NUMBER"; then
        notify "PROGRESS" "$WORKFLOW_ID" "COMMENT_RESOLUTION" "Comments resolved for PR #$PR_NUMBER"
        echo "Comment resolution complete"
    else
        notify "ERROR" "$WORKFLOW_ID" "COMMENT_RESOLUTION" "Comment resolution failed for PR #$PR_NUMBER"
        error "Comment resolution failed for PR #$PR_NUMBER"
    fi
fi

echo ""

# ============================================================================
# Phase 5: Completion
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Workflow Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Workflow ID: $WORKFLOW_ID"
echo "PR Number: #$PR_NUMBER"
echo ""
echo "The workflow has completed successfully."
echo "All phases executed without errors."
echo ""
echo "Next steps:"
echo "  - Review PR: gh pr view $PR_NUMBER"
echo "  - Check CI: gh pr checks $PR_NUMBER"
echo "  - Merge when ready: gh pr merge $PR_NUMBER"
echo ""

notify "SUCCESS" "$WORKFLOW_ID" "COMPLETE" "Workflow finished successfully (PR #$PR_NUMBER)"

exit 0
