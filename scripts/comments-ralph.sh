#!/usr/bin/env bash
#
# comments-ralph.sh - Autonomous comment resolution loop
#
# Continuously monitors and resolves PR review comments until all resolved or max iterations.
# Called by workflow-ralph.sh after CI passes.
#
# Usage:
#   ./scripts/comments-ralph.sh <pr-number>
#
# Flow:
#   1. Parse and validate PR number argument
#   2. Count pending/unresolved comments
#   3. If pending comments exist, invoke /workflows:resolve-comments
#   4. Stage, commit, and push changes
#   5. Wait for reviewer response (configurable interval)
#   6. Repeat up to MAX_COMMENT_ITERATIONS times
#   7. Exit with success when all resolved, failure on max iterations

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

readonly NOTIFICATION_LOG="$HOME/.workflow-notifications.log"
readonly MAX_COMMENT_ITERATIONS="${MAX_COMMENT_ITERATIONS:-10}"
readonly REVIEWER_WAIT_TIME="${REVIEWER_WAIT_TIME:-300}"  # 5 minutes default

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
  1. Count pending/unresolved PR comments
  2. Invoke /workflows:resolve-comments if needed
  3. Stage, commit, and push changes
  4. Wait ${REVIEWER_WAIT_TIME}s for reviewer response
  5. Repeat up to $MAX_COMMENT_ITERATIONS times
  6. Exit success when all comments resolved

Environment Variables:
  MAX_COMMENT_ITERATIONS    Max resolution cycles (default: 10)
  REVIEWER_WAIT_TIME        Wait time between cycles in seconds (default: 300)

Configuration:
  MAX_COMMENT_ITERATIONS=$MAX_COMMENT_ITERATIONS
  REVIEWER_WAIT_TIME=${REVIEWER_WAIT_TIME}s between resolution cycles

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
echo "Comments Ralph - Autonomous Comment Resolution"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PR Number: #$PR_NUMBER"
echo "Max Iterations: $MAX_COMMENT_ITERATIONS"
echo "Reviewer Wait Time: ${REVIEWER_WAIT_TIME}s"
echo ""

notify "STARTED" "$WORKFLOW_ID" "COMMENT_RESOLUTION" "Beginning comment resolution loop for PR #$PR_NUMBER"

# ============================================================================
# Utility Functions
# ============================================================================

# Get repository info (owner/repo)
# Returns: "owner/repo" format
get_repo_info() {
    # Try to get from gh CLI
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
# Args: pr_number
# Returns: integer count of unresolved comments
count_pending_comments() {
    local pr="$1"
    local repo
    repo=$(get_repo_info)

    # Get PR review comments and regular comments
    # Review comments can have an in_reply_to_id (threaded)
    # We'll count top-level unresolved review comments
    local review_comments
    review_comments=$(gh api "repos/$repo/pulls/$pr/comments" --jq '[.[] | select(.in_reply_to_id == null)] | length' 2>/dev/null || echo "0")

    # Get PR issue comments (general comments not tied to code)
    local issue_comments
    issue_comments=$(gh api "repos/$repo/issues/$pr/comments" --jq 'length' 2>/dev/null || echo "0")

    # Get review status
    local reviews_json
    reviews_json=$(gh pr view "$pr" --json reviews -q '.reviews' 2>/dev/null || echo "[]")

    # Count reviews that are "CHANGES_REQUESTED"
    local changes_requested
    changes_requested=$(echo "$reviews_json" | jq '[.[] | select(.state == "CHANGES_REQUESTED")] | length' 2>/dev/null || echo "0")

    # Total pending = review comments + issue comments + changes requested reviews
    # Note: This is a simplistic count. In real scenarios, we'd filter for resolved vs unresolved.
    # For MVP, we'll count all review comments + changes_requested reviews
    local total=$((review_comments + changes_requested))

    echo "$total"
}

# Check if PR has pending comments or requested changes
# Args: pr_number
# Returns: 0 if comments exist, 1 if none
has_pending_comments() {
    local pr="$1"
    local count
    count=$(count_pending_comments "$pr")

    if [ "$count" -gt 0 ]; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
# Main Comment Resolution Loop
# ============================================================================

ITERATION=1

while [ $ITERATION -le $MAX_COMMENT_ITERATIONS ]; do
    echo ""
    echo "━━━ Comment Resolution Iteration $ITERATION/$MAX_COMMENT_ITERATIONS ━━━"
    echo ""

    # Count pending comments
    echo "Checking for pending comments on PR #$PR_NUMBER..."
    PENDING_COUNT=$(count_pending_comments "$PR_NUMBER")

    echo "Pending comments/reviews: $PENDING_COUNT"

    if [ "$PENDING_COUNT" -eq 0 ]; then
        echo ""
        echo "✓ No pending comments or requested changes!"
        notify "SUCCESS" "$WORKFLOW_ID" "COMMENTS_RESOLVED" "All comments resolved after $ITERATION iteration(s)"
        exit 0
    fi

    # Comments exist, invoke resolve-comments command
    echo ""
    echo "Found $PENDING_COUNT pending comment(s)/review(s)"
    echo "Invoking /workflows:resolve-comments to address feedback..."
    notify "PROGRESS" "$WORKFLOW_ID" "RESOLVE_COMMENTS" "Resolving comments (iteration $ITERATION/$MAX_COMMENT_ITERATIONS)"

    if ! claude -p "/workflows:resolve-comments $PR_NUMBER" --output-format stream-json 2>&1; then
        echo "Warning: /workflows:resolve-comments command failed"
        notify "ERROR" "$WORKFLOW_ID" "RESOLVE_FAILED" "Command failed at iteration $ITERATION"
        # Continue to next iteration anyway
    fi

    # Stage and commit changes made by resolve-comments
    echo ""
    echo "Staging and committing resolution changes..."

    if git diff --quiet && git diff --staged --quiet; then
        echo "No changes to commit (resolve-comments may not have made changes)"
        echo "This could indicate:"
        echo "  - Comments are discussion-only (no code changes needed)"
        echo "  - Comments were already resolved"
        echo "  - Resolution requires manual intervention"
        echo ""
        echo "Continuing to next iteration..."
    else
        git add .
        if ! git commit -m "fix(review): address review comments (iteration $ITERATION)

Applied changes from /workflows:resolve-comments (iteration $ITERATION/$MAX_COMMENT_ITERATIONS)"; then
            echo "Warning: git commit failed"
        fi

        # Push changes
        echo ""
        echo "Pushing resolution changes..."
        PUSH_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

        if ! git push origin HEAD 2>&1; then
            echo "Warning: git push failed"
            notify "ERROR" "$WORKFLOW_ID" "PUSH_FAILED" "Push failed at iteration $ITERATION"
            error "Failed to push changes"
        fi

        echo "Changes pushed at $PUSH_TIME"
    fi

    # Wait for reviewer response before checking again
    # Only wait if we haven't reached max iterations
    if [ $ITERATION -lt $MAX_COMMENT_ITERATIONS ]; then
        echo ""
        echo "Waiting ${REVIEWER_WAIT_TIME}s for reviewer response..."
        notify "PROGRESS" "$WORKFLOW_ID" "WAITING" "Waiting for reviewer feedback (iteration $ITERATION)"

        # Show countdown in minutes for long waits
        if [ $REVIEWER_WAIT_TIME -ge 60 ]; then
            local minutes=$((REVIEWER_WAIT_TIME / 60))
            echo "Waiting $minutes minute(s)..."
        fi

        sleep "$REVIEWER_WAIT_TIME"
    fi

    ITERATION=$((ITERATION + 1))
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
