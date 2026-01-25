#!/usr/bin/env bash
#
# comments-ralph.sh - Autonomous comment resolution loop (AFK Ralph pattern)
#
# Continuously monitors and resolves PR review comments until all resolved or max iterations.
# Called by workflow-ralph.sh after CI passes.
#
# Features:
#   - Docker sandbox mode for AFK safety (USE_SANDBOX=true)
#   - YOLO mode to skip permission prompts (YOLO_MODE=true)
#   - jq streaming for real-time output
#
# Usage:
#   ./scripts/comments-ralph.sh <pr-number>
#
#   # Full AFK mode (Docker + YOLO) - default
#   ./comments-ralph.sh 123
#
#   # No sandbox (faster, less safe)
#   USE_SANDBOX=false ./comments-ralph.sh 123
#
#   # Interactive mode (keep permission prompts)
#   YOLO_MODE=false ./comments-ralph.sh 123

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

# jq filter for streaming assistant text
JQ_STREAM='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty'

# jq filter for final result
JQ_RESULT='select(.type == "result").result // empty'

# ============================================================================
# Configuration
# ============================================================================

readonly NOTIFICATION_LOG="$HOME/.workflow-notifications.log"
readonly MAX_COMMENT_ITERATIONS="${MAX_COMMENT_ITERATIONS:-10}"
readonly REVIEWER_WAIT_TIME="${REVIEWER_WAIT_TIME:-300}"  # 5 minutes default
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
Usage: $0 <pr-number>

Arguments:
  pr-number    GitHub PR number (positive integer)

Example:
  $0 123

Environment Variables:
  USE_SANDBOX              Docker sandbox mode (default: true)
  YOLO_MODE                Skip permission prompts (default: true)
  MAX_COMMENT_ITERATIONS   Max resolution cycles (default: 10)
  REVIEWER_WAIT_TIME       Wait time between cycles in seconds (default: 300)
  VERBOSE                  Show raw jq output (default: false)

The script will:
  1. Count pending/unresolved PR comments
  2. Invoke /workflows:resolve-comments if needed
  3. Stage, commit, and push changes
  4. Wait ${REVIEWER_WAIT_TIME}s for reviewer response
  5. Repeat up to $MAX_COMMENT_ITERATIONS times
  6. Exit success when all comments resolved

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

# ============================================================================
# Comment Utility Functions
# ============================================================================

# Get repository info (owner/repo)
get_repo_info() {
    local repo
    repo=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)

    if [ -z "$repo" ]; then
        # Fallback: parse from git remote
        repo=$(git remote get-url origin 2>/dev/null | sed -E 's|.*github.com[:/](.+/.+)\.git.*|\1|')
    fi

    if [ -z "$repo" ]; then
        error "Could not determine repository (owner/repo)"
    fi

    echo "$repo"
}

# Count pending PR comments
count_pending_comments() {
    local pr="$1"
    local repo
    repo=$(get_repo_info)

    # Get PR review comments (top-level only)
    local review_comments
    review_comments=$(gh api "repos/$repo/pulls/$pr/comments" --jq '[.[] | select(.in_reply_to_id == null)] | length' 2>/dev/null || echo "0")

    # Get review status
    local reviews_json
    reviews_json=$(gh pr view "$pr" --json reviews -q '.reviews' 2>/dev/null || echo "[]")

    # Count reviews that are "CHANGES_REQUESTED"
    local changes_requested
    changes_requested=$(echo "$reviews_json" | jq '[.[] | select(.state == "CHANGES_REQUESTED")] | length' 2>/dev/null || echo "0")

    # Total pending = review comments + changes_requested reviews
    local total=$((review_comments + changes_requested))

    echo "$total"
}

# ============================================================================
# Argument Parsing
# ============================================================================

if [ $# -eq 0 ]; then
    usage
fi

PR_NUMBER="$1"

# Validate PR number is a positive integer
if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || [ "$PR_NUMBER" -le 0 ]; then
    error "Invalid PR number: $PR_NUMBER (must be positive integer)"
fi

WORKFLOW_ID="pr-$PR_NUMBER"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Comments Ralph - AFK Autonomous Comment Resolution"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PR Number: #$PR_NUMBER"
echo "Sandbox: $USE_SANDBOX"
echo "YOLO Mode: $YOLO_MODE"
echo "Max Iterations: $MAX_COMMENT_ITERATIONS"
echo "Reviewer Wait Time: ${REVIEWER_WAIT_TIME}s"
echo ""

notify "STARTED" "$WORKFLOW_ID" "COMMENT_RESOLUTION" "Beginning comment resolution loop (sandbox=$USE_SANDBOX, yolo=$YOLO_MODE)"

# ============================================================================
# Main Comment Resolution Loop
# ============================================================================

for ((i=1; i<=MAX_COMMENT_ITERATIONS; i++)); do
    echo ""
    echo "━━━ Comment Resolution $i/$MAX_COMMENT_ITERATIONS ━━━"
    echo ""

    # Count pending comments
    echo "Checking for pending comments on PR #$PR_NUMBER..."
    PENDING=$(count_pending_comments "$PR_NUMBER")

    echo "Pending comments/reviews: $PENDING"

    if [ "$PENDING" -eq 0 ]; then
        echo ""
        echo "✓ All comments resolved!"
        notify "SUCCESS" "$WORKFLOW_ID" "COMMENTS_RESOLVED" "All comments resolved after $i iteration(s)"
        exit 0
    fi

    # Comments exist, invoke resolve-comments command
    echo ""
    echo "Resolving $PENDING pending comments..."
    notify "PROGRESS" "$WORKFLOW_ID" "RESOLVE_COMMENTS" "Resolving comments (iteration $i/$MAX_COMMENT_ITERATIONS)"

    run_claude "/workflows:resolve-comments $PR_NUMBER --all" || true

    # Commit and push if changes
    echo ""
    echo "Staging and committing resolution changes..."

    if ! git diff --quiet || ! git diff --staged --quiet; then
        git add .
        git commit -m "fix(review): address comments (attempt $i)

Applied changes from /workflows:resolve-comments (iteration $i/$MAX_COMMENT_ITERATIONS)" || echo "Warning: commit failed"

        # Push changes
        echo ""
        echo "Pushing resolution changes..."

        if ! git push origin HEAD 2>&1; then
            notify "ERROR" "$WORKFLOW_ID" "PUSH_FAILED" "Push failed at iteration $i"
            error "Failed to push changes"
        fi

        echo "Changes pushed"
    else
        echo "No changes to commit (resolve-comments may not have made changes)"
        echo "This could indicate:"
        echo "  - Comments are discussion-only"
        echo "  - Comments were already resolved"
        echo "  - Resolution requires manual intervention"
    fi

    # Wait for reviewer response before checking again
    if [ $i -lt $MAX_COMMENT_ITERATIONS ]; then
        echo ""
        echo "Waiting ${REVIEWER_WAIT_TIME}s for reviewer..."
        notify "PROGRESS" "$WORKFLOW_ID" "WAITING" "Waiting for reviewer feedback (iteration $i)"

        # Show countdown in minutes for long waits
        if [ $REVIEWER_WAIT_TIME -ge 60 ]; then
            minutes=$((REVIEWER_WAIT_TIME / 60))
            echo "Waiting $minutes minute(s)..."
        fi

        sleep "$REVIEWER_WAIT_TIME"
    fi
done

# Max iterations reached
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Max comment resolution iterations reached ($MAX_COMMENT_ITERATIONS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Comments are still pending after $MAX_COMMENT_ITERATIONS resolution attempts."
echo "Manual intervention may be required."
echo ""

# Final count
FINAL_COUNT=$(count_pending_comments "$PR_NUMBER")
echo "Remaining pending comments/reviews: $FINAL_COUNT"
echo ""

echo "Review comments:"
echo "  gh pr view $PR_NUMBER"
echo ""
echo "View comment threads:"
echo "  gh pr view $PR_NUMBER --web"
echo ""

notify "ERROR" "$WORKFLOW_ID" "MAX_ITERATIONS" "Max comment iterations ($MAX_COMMENT_ITERATIONS) reached, $FINAL_COUNT comments still pending"
exit 1
