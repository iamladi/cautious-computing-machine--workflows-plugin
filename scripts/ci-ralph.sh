#!/usr/bin/env bash
#
# ci-ralph.sh - Autonomous CI resolution loop
#
# Continuously monitors and fixes CI failures until success or max iterations.
# Called by workflow-ralph.sh after PR creation.
#
# Usage:
#   ./scripts/ci-ralph.sh <pr-number>
#
# Flow:
#   1. Parse and validate PR number argument
#   2. Poll CI status until complete
#   3. If failing, invoke /github:fix-ci
#   4. Push changes and wait for new CI run
#   5. Repeat up to MAX_CI_ITERATIONS times
#   6. Detect stuck state (same errors 2x)
#   7. Exit with success (0) or failure (1)

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

readonly NOTIFICATION_LOG="$HOME/.workflow-notifications.log"
readonly MAX_CI_ITERATIONS=10
readonly CI_START_TIMEOUT=120  # 2 minutes for CI to start
readonly CI_RUN_TIMEOUT=1800   # 30 minutes for CI to complete
readonly POLL_INTERVAL=30      # Poll every 30 seconds

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

The script will:
  1. Poll CI status for the PR
  2. Fix failures with /github:fix-ci
  3. Push changes and wait for CI
  4. Repeat up to $MAX_CI_ITERATIONS times
  5. Abort if stuck (same errors 2x)

Configuration:
  MAX_CI_ITERATIONS=$MAX_CI_ITERATIONS
  CI_TIMEOUT=${CI_RUN_TIMEOUT}s per iteration
  CI_START_TIMEOUT=${CI_START_TIMEOUT}s wait for CI start

EOF
    exit 1
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
echo "CI Ralph - Autonomous CI Resolution"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PR Number: #$PR_NUMBER"
echo "Max Iterations: $MAX_CI_ITERATIONS"
echo "CI Timeout: ${CI_RUN_TIMEOUT}s"
echo ""

notify "STARTED" "$WORKFLOW_ID" "CI_RESOLUTION" "Beginning CI fix loop for PR #$PR_NUMBER"

# ============================================================================
# Utility Functions
# ============================================================================

# Wait for CI to complete
# Args: pr_number, timeout_seconds
# Returns: 0 if complete, 1 if timeout
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
# Args: pr_number
# Returns: "passing", "failing", "pending", or "error"
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

# Get CI error summary
# Args: pr_number
# Returns: SHA256 hash of error messages (for detecting stuck state)
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
# Args: pr_number, push_timestamp
# Returns: 0 if started, 1 if timeout
wait_for_ci_start() {
    local pr="$1"
    local push_time="$2"
    local timeout="$CI_START_TIMEOUT"
    local start_time
    start_time=$(date +%s)

    echo "Waiting for new CI run to start..."

    while true; do
        local elapsed=$(($(date +%s) - start_time))

        if [ $elapsed -ge $timeout ]; then
            echo "Warning: No new CI run detected after ${timeout}s"
            echo "CI may not be configured for this PR"
            return 1
        fi

        # Check if CI has started running
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
# Main CI Fix Loop
# ============================================================================

ITERATION=1
LAST_ERROR_HASH=""
CONSECUTIVE_SAME_ERRORS=0

while [ $ITERATION -le $MAX_CI_ITERATIONS ]; do
    echo ""
    echo "━━━ CI Fix Iteration $ITERATION/$MAX_CI_ITERATIONS ━━━"
    echo ""

    # Check current CI status
    echo "Checking CI status for PR #$PR_NUMBER..."
    CI_STATUS=$(get_ci_status "$PR_NUMBER")

    echo "CI Status: $CI_STATUS"

    case "$CI_STATUS" in
        passing)
            echo ""
            echo "✓ CI is passing!"
            notify "SUCCESS" "$WORKFLOW_ID" "CI_COMPLETE" "CI checks passed after $ITERATION iteration(s)"
            exit 0
            ;;

        pending)
            echo "CI is still running, waiting for completion..."
            if ! wait_for_ci_complete "$PR_NUMBER" "$CI_RUN_TIMEOUT"; then
                notify "ERROR" "$WORKFLOW_ID" "CI_TIMEOUT" "CI run timeout at iteration $ITERATION"
                error "CI run timed out after ${CI_RUN_TIMEOUT}s"
            fi
            # After wait completes, loop will re-check status
            continue
            ;;

        failing)
            echo "CI is failing, analyzing errors..."

            # Get error hash for stuck detection
            CURRENT_ERROR_HASH=$(get_ci_errors_hash "$PR_NUMBER")

            # Check if we're stuck on same errors
            if [ -n "$LAST_ERROR_HASH" ] && [ "$CURRENT_ERROR_HASH" = "$LAST_ERROR_HASH" ]; then
                CONSECUTIVE_SAME_ERRORS=$((CONSECUTIVE_SAME_ERRORS + 1))
                echo "Warning: Same errors detected ($CONSECUTIVE_SAME_ERRORS consecutive time(s))"

                if [ $CONSECUTIVE_SAME_ERRORS -ge 2 ]; then
                    echo ""
                    echo "ERROR: Stuck on same errors after 2 fix attempts"
                    echo "These errors may require manual intervention"
                    echo ""
                    echo "Failed checks:"
                    gh pr checks "$PR_NUMBER" 2>/dev/null | grep -E "(fail|×)" || true
                    echo ""
                    notify "ERROR" "$WORKFLOW_ID" "CI_STUCK" "Stuck on same errors after $ITERATION iterations"
                    error "CI fix loop stuck - same errors detected twice in a row"
                fi
            else
                # Different errors, reset counter
                CONSECUTIVE_SAME_ERRORS=0
            fi

            LAST_ERROR_HASH="$CURRENT_ERROR_HASH"

            # Invoke fix-ci command
            echo ""
            echo "Invoking /github:fix-ci to resolve failures..."
            notify "PROGRESS" "$WORKFLOW_ID" "CI_FIX" "Attempting fix $ITERATION/$MAX_CI_ITERATIONS"

            if ! claude -p "/github:fix-ci" --output-format stream-json 2>&1; then
                echo "Warning: /github:fix-ci command failed"
                notify "ERROR" "$WORKFLOW_ID" "CI_FIX_FAILED" "Fix command failed at iteration $ITERATION"
                # Continue to next iteration anyway
            fi

            # Push changes
            echo ""
            echo "Pushing fixes to trigger new CI run..."
            PUSH_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

            if ! git push origin HEAD 2>&1; then
                echo "Warning: git push failed"
                notify "ERROR" "$WORKFLOW_ID" "PUSH_FAILED" "Push failed at iteration $ITERATION"
                error "Failed to push changes for CI re-run"
            fi

            echo "Changes pushed at $PUSH_TIME"

            # Wait for new CI run to start
            if ! wait_for_ci_start "$PR_NUMBER" "$PUSH_TIME"; then
                echo "Warning: Could not detect new CI run"
                echo "Waiting $POLL_INTERVAL seconds before checking status..."
                sleep "$POLL_INTERVAL"
            fi

            # Wait for CI run to complete
            echo ""
            if ! wait_for_ci_complete "$PR_NUMBER" "$CI_RUN_TIMEOUT"; then
                notify "ERROR" "$WORKFLOW_ID" "CI_TIMEOUT" "CI run timeout at iteration $ITERATION"
                error "CI run timed out after ${CI_RUN_TIMEOUT}s"
            fi
            ;;

        error)
            echo "Error: Could not get CI status (PR may not exist or no checks configured)"
            notify "ERROR" "$WORKFLOW_ID" "CI_STATUS_ERROR" "Could not get CI status for PR #$PR_NUMBER"
            error "Failed to get CI status for PR #$PR_NUMBER"
            ;;
    esac

    ITERATION=$((ITERATION + 1))
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
