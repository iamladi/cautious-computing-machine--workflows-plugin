#!/usr/bin/env bash
#
# workflow-ralph.sh - Autonomous workflow orchestrator
#
# The "Ralph Wiggum" pattern: Run and walk away while the workflow completes.
# This script orchestrates the full SDLC pipeline from research to PR submission,
# handling CI failures and comment resolution autonomously.
#
# Usage:
#   ./scripts/workflow-ralph.sh research/my-feature.md
#
# Flow:
#   1. Parse arguments and validate research file
#   2. Loop /workflows:build until PR_CREATED signal
#   3. Call ci-ralph.sh for CI resolution
#   4. Call comments-ralph.sh for comment resolution
#   5. Log success/failure to notification log

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly NOTIFICATION_LOG="$HOME/.workflow-notifications.log"
readonly MAX_BUILD_ITERATIONS=10
readonly PROGRESS_FILE=".workflow-progress.txt"

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

The script will:
  1. Run /workflows:build in a loop until PR is created
  2. Resolve CI failures with ci-ralph.sh
  3. Handle PR comments with comments-ralph.sh
  4. Log progress to $NOTIFICATION_LOG

EOF
    exit 1
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
# Example: research/my-feature.md -> my-feature
# If filename contains timestamp, extract that for uniqueness
WORKFLOW_ID=$(basename "$RESEARCH_FILE" .md)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Workflow Ralph - Autonomous Orchestrator"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Research: $RESEARCH_FILE"
echo "Workflow ID: $WORKFLOW_ID"
echo "Notifications: $NOTIFICATION_LOG"
echo ""

notify "STARTED" "$WORKFLOW_ID" "INIT" "Beginning workflow execution"

# ============================================================================
# Phase 1: Build Loop (until PR created)
# ============================================================================

echo "Phase 1: Build Loop"
echo "Running /workflows:build until PR is created..."
echo ""

BUILD_ITERATION=1
PR_NUMBER=""
BUILD_COMPLETE=false

while [ $BUILD_ITERATION -le $MAX_BUILD_ITERATIONS ]; do
    echo "━━━ Build Iteration $BUILD_ITERATION/$MAX_BUILD_ITERATIONS ━━━"

    # Run claude with /workflows:build and parse signals
    # Using -p (print mode) for non-interactive execution
    # Using --output-format stream-json for signal parsing
    # Signals are emitted as: <phase>SIGNAL_NAME</phase>

    if claude -p "/workflows:build \"$RESEARCH_FILE\"" --output-format stream-json 2>&1 | while IFS= read -r line; do
        # Echo line for visibility
        echo "$line"

        # Parse phase signals using grep/sed
        # Signal format: <phase>SIGNAL_NAME</phase>
        if echo "$line" | grep -q '<phase>.*</phase>'; then
            SIGNAL=$(echo "$line" | sed -n 's/.*<phase>\(.*\)<\/phase>.*/\1/p')

            case "$SIGNAL" in
                SETUP_COMPLETE)
                    notify "PROGRESS" "$WORKFLOW_ID" "SETUP" "Worktree and dependencies initialized"
                    ;;
                PLANNING_COMPLETE)
                    notify "PROGRESS" "$WORKFLOW_ID" "PLANNING" "Implementation plans generated"
                    ;;
                IMPLEMENTATION_COMPLETE)
                    notify "PROGRESS" "$WORKFLOW_ID" "IMPLEMENTATION" "All plans implemented"
                    ;;
                SUBMISSION_COMPLETE)
                    notify "PROGRESS" "$WORKFLOW_ID" "SUBMISSION" "PR created and pushed"
                    ;;
                PR_CREATED)
                    # This is our signal to exit the build loop
                    notify "PROGRESS" "$WORKFLOW_ID" "PR_CREATED" "Pull request created successfully"
                    echo "PR_CREATED signal detected - exiting build loop"
                    exit 0  # Exit the while read loop
                    ;;
                WORKFLOW_COMPLETE)
                    notify "SUCCESS" "$WORKFLOW_ID" "COMPLETE" "Workflow finished successfully"
                    echo "WORKFLOW_COMPLETE signal detected"
                    exit 0
                    ;;
                ERROR:*)
                    # Parse error signal: ERROR:phase:message
                    ERROR_PHASE=$(echo "$SIGNAL" | cut -d: -f2)
                    ERROR_MSG=$(echo "$SIGNAL" | cut -d: -f3-)
                    notify "ERROR" "$WORKFLOW_ID" "$ERROR_PHASE" "$ERROR_MSG"
                    echo "ERROR signal detected: $ERROR_MSG"
                    exit 1
                    ;;
            esac
        fi
    done; then
        # Pipe succeeded (got PR_CREATED or WORKFLOW_COMPLETE)
        BUILD_COMPLETE=true
        break
    else
        # Pipe failed (error occurred)
        notify "ERROR" "$WORKFLOW_ID" "BUILD" "Build command failed at iteration $BUILD_ITERATION"
        error "Build loop failed at iteration $BUILD_ITERATION"
    fi

    # Safety check: if we're still here, increment and continue
    BUILD_ITERATION=$((BUILD_ITERATION + 1))

    if [ $BUILD_ITERATION -gt $MAX_BUILD_ITERATIONS ]; then
        notify "ERROR" "$WORKFLOW_ID" "BUILD" "Max build iterations reached ($MAX_BUILD_ITERATIONS)"
        error "Maximum build iterations ($MAX_BUILD_ITERATIONS) reached without PR creation"
    fi

    echo ""
    echo "Build iteration complete, checking if PR was created..."
    sleep 2
done

if [ "$BUILD_COMPLETE" = false ]; then
    error "Build loop did not complete successfully"
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
# Progress file should be at worktree root, need to locate it
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
# Format: "number: 123" in the PR section
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
    echo "Skipping CI resolution phase (will be implemented in future)"
    notify "SKIPPED" "$WORKFLOW_ID" "CI_RESOLUTION" "ci-ralph.sh not yet implemented"
else
    if "$CI_SCRIPT" "$PR_NUMBER"; then
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
    echo "Skipping comment resolution phase (will be implemented in future)"
    notify "SKIPPED" "$WORKFLOW_ID" "COMMENT_RESOLUTION" "comments-ralph.sh not yet implemented"
else
    if "$COMMENTS_SCRIPT" "$PR_NUMBER"; then
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
