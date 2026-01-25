#!/usr/bin/env bash
#
# ci-ralph.sh - Autonomous CI resolution loop (AFK Ralph pattern)
#
# Continuously monitors and fixes CI failures until success or max iterations.
# Called by workflow-ralph.sh after PR creation.
#
# Features:
#   - Docker sandbox mode for AFK safety (USE_SANDBOX=true)
#   - YOLO mode to skip permission prompts (YOLO_MODE=true)
#   - jq streaming for real-time output
#   - Stuck detection (same errors 2x)
#
# Usage:
#   ./scripts/ci-ralph.sh <pr-number>
#
#   # Full AFK mode (Docker + YOLO) - default
#   ./ci-ralph.sh 123
#
#   # No sandbox (faster, less safe)
#   USE_SANDBOX=false ./ci-ralph.sh 123
#
#   # Interactive mode (keep permission prompts)
#   YOLO_MODE=false ./ci-ralph.sh 123

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
readonly MAX_CI_ITERATIONS="${MAX_CI_ITERATIONS:-10}"
readonly CI_START_TIMEOUT="${CI_START_TIMEOUT:-120}"  # 2 minutes for CI to start
readonly CI_RUN_TIMEOUT="${CI_RUN_TIMEOUT:-1800}"     # 30 minutes for CI to complete
readonly POLL_INTERVAL="${POLL_INTERVAL:-30}"         # Poll every 30 seconds
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
  USE_SANDBOX         Docker sandbox mode (default: true)
  YOLO_MODE           Skip permission prompts (default: true)
  MAX_CI_ITERATIONS   Max fix iterations (default: 10)
  CI_RUN_TIMEOUT      CI run timeout in seconds (default: 1800)
  VERBOSE             Show raw jq output (default: false)

The script will:
  1. Poll CI status for the PR
  2. Fix failures with /github:fix-ci
  3. Push changes and wait for CI
  4. Repeat up to $MAX_CI_ITERATIONS times
  5. Abort if stuck (same errors 2x)

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
# CI Utility Functions
# ============================================================================

# Wait for CI to complete
wait_for_ci_complete() {
    local pr="$1"
    local timeout="$2"
    local start_time
    start_time=$(date +%s)

    echo "Waiting for CI to complete (timeout: ${timeout}s)..."

    while true; do
        local elapsed=$(($(date +%s) - start_time))

        if [ $elapsed -ge $timeout ]; then
            echo "CI wait timeout after ${timeout}s"
            return 1
        fi

        # Get CI status
        local ci_status
        ci_status=$(gh pr checks "$pr" --json state,conclusion 2>/dev/null || echo "[]")

        # Check if all checks are complete (have conclusions)
        local pending
        pending=$(echo "$ci_status" | jq '[.[] | select(.conclusion == null)] | length')

        if [ "$pending" -eq 0 ]; then
            echo "CI run complete"
            return 0
        fi

        echo "CI still running... ($elapsed/${timeout}s elapsed)"
        sleep "$POLL_INTERVAL"
    done
}

# Check CI status
get_ci_status() {
    local pr="$1"

    local ci_json
    ci_json=$(gh pr checks "$pr" --json state,conclusion 2>/dev/null || echo "[]")

    if [ "$ci_json" = "[]" ]; then
        echo "error"
        return
    fi

    # Check if any checks are still pending
    local pending
    pending=$(echo "$ci_json" | jq '[.[] | select(.conclusion == null)] | length')

    if [ "$pending" -gt 0 ]; then
        echo "pending"
        return
    fi

    # Check if any checks failed
    local failed
    failed=$(echo "$ci_json" | jq '[.[] | select(.conclusion == "failure" or .conclusion == "cancelled")] | length')

    if [ "$failed" -gt 0 ]; then
        echo "failing"
        return
    fi

    echo "passing"
}

# Get CI error summary hash (for detecting stuck state)
get_ci_errors_hash() {
    local pr="$1"

    local errors
    errors=$(gh pr checks "$pr" --json name,conclusion,detailsUrl 2>/dev/null | \
        jq -r '.[] | select(.conclusion == "failure" or .conclusion == "cancelled") | "\(.name): \(.conclusion)"' | \
        sort)

    if [ -z "$errors" ]; then
        echo ""
        return
    fi

    echo "$errors" | shasum -a 256 | cut -d' ' -f1
}

# Wait for new CI run to start after push
wait_for_ci_start() {
    local pr="$1"
    local timeout="$CI_START_TIMEOUT"
    local start_time
    start_time=$(date +%s)

    echo "Waiting for new CI run to start..."

    while true; do
        local elapsed=$(($(date +%s) - start_time))

        if [ $elapsed -ge $timeout ]; then
            echo "Warning: No new CI run detected after ${timeout}s"
            return 1
        fi

        local ci_status
        ci_status=$(get_ci_status "$pr")

        if [ "$ci_status" = "pending" ] || [ "$ci_status" = "failing" ] || [ "$ci_status" = "passing" ]; then
            echo "CI run detected"
            return 0
        fi

        echo "Waiting for CI to start... ($elapsed/${timeout}s elapsed)"
        sleep 5
    done
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
echo "CI Ralph - AFK Autonomous CI Resolution"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PR Number: #$PR_NUMBER"
echo "Sandbox: $USE_SANDBOX"
echo "YOLO Mode: $YOLO_MODE"
echo "Max Iterations: $MAX_CI_ITERATIONS"
echo "CI Timeout: ${CI_RUN_TIMEOUT}s"
echo ""

notify "STARTED" "$WORKFLOW_ID" "CI_RESOLUTION" "Beginning CI fix loop (sandbox=$USE_SANDBOX, yolo=$YOLO_MODE)"

# ============================================================================
# Main CI Fix Loop
# ============================================================================

LAST_ERROR_HASH=""
CONSECUTIVE_SAME_ERRORS=0

for ((i=1; i<=MAX_CI_ITERATIONS; i++)); do
    echo ""
    echo "━━━ CI Fix Iteration $i/$MAX_CI_ITERATIONS ━━━"
    echo ""

    # Check current CI status
    echo "Checking CI status for PR #$PR_NUMBER..."
    CI_STATUS=$(get_ci_status "$PR_NUMBER")

    echo "CI Status: $CI_STATUS"

    case "$CI_STATUS" in
        passing)
            echo ""
            echo "✓ CI is passing!"
            notify "SUCCESS" "$WORKFLOW_ID" "CI_COMPLETE" "CI checks passed after $i iteration(s)"
            exit 0
            ;;

        pending)
            echo "CI is still running, waiting for completion..."
            if ! wait_for_ci_complete "$PR_NUMBER" "$CI_RUN_TIMEOUT"; then
                notify "ERROR" "$WORKFLOW_ID" "CI_TIMEOUT" "CI run timeout at iteration $i"
                error "CI run timed out after ${CI_RUN_TIMEOUT}s"
            fi
            # After wait completes, loop will re-check status
            continue
            ;;

        failing)
            echo "CI is failing, analyzing errors..."

            # Get error hash for stuck detection
            CURRENT_ERROR_HASH=$(get_ci_errors_hash "$PR_NUMBER")

            # Check if stuck on same errors
            if [ -n "$LAST_ERROR_HASH" ] && [ "$CURRENT_ERROR_HASH" = "$LAST_ERROR_HASH" ]; then
                CONSECUTIVE_SAME_ERRORS=$((CONSECUTIVE_SAME_ERRORS + 1))
                echo "Warning: Same errors detected ($CONSECUTIVE_SAME_ERRORS consecutive time(s))"

                if [ $CONSECUTIVE_SAME_ERRORS -ge 1 ]; then
                    echo ""
                    echo "ERROR: Stuck on same errors after 2 fix attempts"
                    echo "These errors may require manual intervention"
                    echo ""
                    echo "Failed checks:"
                    gh pr checks "$PR_NUMBER" 2>/dev/null | grep -E "(fail|×)" || true
                    echo ""
                    notify "ERROR" "$WORKFLOW_ID" "CI_STUCK" "Stuck on same errors after $i iterations"
                    error "CI fix loop stuck - same errors detected twice in a row"
                fi
            else
                CONSECUTIVE_SAME_ERRORS=0
            fi

            LAST_ERROR_HASH="$CURRENT_ERROR_HASH"

            # Invoke fix-ci command
            echo ""
            echo "Invoking /github:fix-ci to resolve failures..."
            notify "PROGRESS" "$WORKFLOW_ID" "CI_FIX" "Attempting fix $i/$MAX_CI_ITERATIONS"

            run_claude "/github:fix-ci" || true

            # Commit and push if changes
            echo ""
            echo "Staging and committing fixes..."

            if ! git diff --quiet || ! git diff --staged --quiet; then
                git add .
                git commit -m "fix(ci): automated fix attempt $i

Applied fixes from /github:fix-ci (iteration $i/$MAX_CI_ITERATIONS)" || echo "Warning: commit failed"

                # Push changes
                echo ""
                echo "Pushing fixes to trigger new CI run..."

                if ! git push origin HEAD 2>&1; then
                    notify "ERROR" "$WORKFLOW_ID" "PUSH_FAILED" "Push failed at iteration $i"
                    error "Failed to push changes for CI re-run"
                fi

                echo "Changes pushed"

                # Wait for new CI run to start
                if ! wait_for_ci_start "$PR_NUMBER"; then
                    echo "Warning: Could not detect new CI run"
                    sleep "$POLL_INTERVAL"
                fi

                # Wait for CI run to complete
                if ! wait_for_ci_complete "$PR_NUMBER" "$CI_RUN_TIMEOUT"; then
                    notify "ERROR" "$WORKFLOW_ID" "CI_TIMEOUT" "CI run timeout at iteration $i"
                    error "CI run timed out after ${CI_RUN_TIMEOUT}s"
                fi
            else
                echo "No changes to commit (fix-ci may not have made changes)"
            fi
            ;;

        error)
            echo "Error: Could not get CI status"
            notify "ERROR" "$WORKFLOW_ID" "CI_STATUS_ERROR" "Could not get CI status for PR #$PR_NUMBER"
            error "Failed to get CI status for PR #$PR_NUMBER"
            ;;
    esac
done

# Max iterations reached
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Max CI fix iterations reached ($MAX_CI_ITERATIONS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "CI is still failing after $MAX_CI_ITERATIONS fix attempts."
echo "Manual intervention may be required."
echo ""
echo "Review CI status:"
echo "  gh pr checks $PR_NUMBER"
echo ""
echo "View failed logs:"
echo "  gh pr checks $PR_NUMBER --web"
echo ""

notify "ERROR" "$WORKFLOW_ID" "MAX_ITERATIONS" "Max CI iterations ($MAX_CI_ITERATIONS) reached without success"
exit 1
