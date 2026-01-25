---
name: comment-resolution
description: Orchestrates exhaustive PR comment resolution. Fetches ALL comment types, categorizes them, applies fixes or posts replies, and handles reviewer back-and-forth until all comments are addressed.
---

# Comment Resolution Skill

Automatically fetch, process, and resolve ALL PR comments until the PR is ready to merge. This skill orchestrates the comment-resolver agent in a loop until no unaddressed comments remain.

## When to Use

- After PR is created and has received review comments
- When reviewer requests changes
- As part of autonomous workflow build system (Phase 4)
- When you need exhaustive comment resolution without manual intervention

## Invocation Pattern

```
/workflows:comment-resolution {pr-number}
```

or programmatically:

```
Skill(workflows:comment-resolution, args: "{pr-number}")
```

## Arguments

The skill expects a PR number or URL:
- `$ARGUMENTS` - PR number (e.g., `123`) or full PR URL

If no argument provided, prompt the user to specify one.

## Workflow

### Step 1: Extract PR Information

Parse the PR argument to get owner/repo/number:

```bash
# If argument is a URL, extract parts
# Example: https://github.com/owner/repo/pull/123
if [[ "$PR_ARG" =~ github.com/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
  PR_NUMBER="${BASH_REMATCH[3]}"
else
  # Assume it's just a number, get owner/repo from current repo
  PR_NUMBER="$PR_ARG"
  REPO_INFO=$(gh repo view --json owner,name)
  OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login')
  REPO=$(echo "$REPO_INFO" | jq -r '.name')
fi

# Get PR metadata
gh pr view "$PR_NUMBER" --json title,headRefName,baseRefName,state
```

If PR not found, stop with error: "PR #$PR_NUMBER not found"

### Step 2: Checkout PR Branch

Ensure we're on the correct branch:

```bash
# Checkout PR branch
gh pr checkout "$PR_NUMBER"

# Verify branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Working on branch: $CURRENT_BRANCH"
```

### Step 3: Fetch ALL Comments

Fetch all comment types from GitHub API using a reusable function:

```bash
# Reusable function to fetch all comment types
fetch_all_comments() {
  local owner="$1"
  local repo="$2"
  local pr_number="$3"

  # Review Comments (file/line level)
  local review_comments=$(gh api "repos/$owner/$repo/pulls/$pr_number/comments" \
    --jq '.[] | {
      id: .id,
      type: "review",
      path: .path,
      line: (.line // .original_line),
      body: .body,
      user: .user.login,
      created_at: .created_at,
      in_reply_to_id: .in_reply_to_id
    }')

  # Review-Level Comments
  local review_summaries=$(gh api "repos/$owner/$repo/pulls/$pr_number/reviews" \
    --jq '.[] | select(.body != null and .body != "") | {
      id: .id,
      type: "review-summary",
      body: .body,
      user: .user.login,
      state: .state,
      created_at: .submitted_at
    }')

  # Issue Comments (general PR comments)
  local issue_comments=$(gh api "repos/$owner/$repo/issues/$pr_number/comments" \
    --jq '.[] | {
      id: .id,
      type: "issue",
      body: .body,
      user: .user.login,
      created_at: .created_at
    }')

  # Combine all comments into single JSON array
  jq -n --argjson rc "$review_comments" \
        --argjson rs "$review_summaries" \
        --argjson ic "$issue_comments" \
        '$rc + $rs + $ic'
}

# Fetch initial comments
ALL_COMMENTS=$(fetch_all_comments "$OWNER" "$REPO" "$PR_NUMBER")
```

### Step 4: Filter Comments

Filter to actionable comments only:

```bash
# Exclude:
# - Comments from the PR author (our own comments)
# - Replies to other comments (in_reply_to_id != null)
# - Bot comments (dependabot, github-actions, etc.)
# - Resolved threads (if marked as resolved)

PR_AUTHOR=$(gh pr view "$PR_NUMBER" --json author --jq '.author.login')

# Filter logic:
# - user != PR_AUTHOR
# - in_reply_to_id == null (top-level only)
# - user not in bot list
```

Track unaddressed comments in a state file:

```bash
# Store in temporary state file
STATE_FILE="/tmp/pr-${PR_NUMBER}-comments.json"
echo "$FILTERED_COMMENTS" > "$STATE_FILE"
```

### Step 5: Processing Loop

Loop until no unaddressed comments remain:

```bash
ITERATION=1
MAX_ITERATIONS=10  # Safety limit to prevent infinite loops

while [ $ITERATION -le $MAX_ITERATIONS ]; do
  # Capture timestamp at START of iteration to track new comments
  LAST_CHECK_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Iteration $ITERATION: Processing comments..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Count unaddressed comments
  UNADDRESSED_COUNT=$(jq 'length' "$STATE_FILE")

  if [ "$UNADDRESSED_COUNT" -eq 0 ]; then
    echo "✓ No unaddressed comments remaining"
    break
  fi

  echo "Found $UNADDRESSED_COUNT unaddressed comments"

  # Process each comment using comment-resolver agent
  # Use process substitution to avoid subshell scope issues
  while read -r comment; do
    COMMENT_ID=$(echo "$comment" | jq -r '.id')

    # Invoke comment-resolver agent
    Agent(workflows:comment-resolver,
      pr_number: "$PR_NUMBER",
      owner: "$OWNER",
      repo: "$REPO",
      comment: "$comment"
    )

    # Mark comment as addressed (remove from state)
    jq "map(select(.id != $COMMENT_ID))" "$STATE_FILE" > "$STATE_FILE.tmp"
    mv "$STATE_FILE.tmp" "$STATE_FILE"
  done < <(jq -c '.[]' "$STATE_FILE")

  # After processing all current comments, check for NEW comments
  # (reviewers may have replied or added new comments)
  echo ""
  echo "Checking for new comments from reviewers..."

  # Refetch comments using reusable function
  NEW_COMMENTS=$(fetch_all_comments "$OWNER" "$REPO" "$PR_NUMBER")

  # Filter to only NEW comments (created after our last check)
  TRULY_NEW=$(echo "$NEW_COMMENTS" | jq --arg since "$LAST_CHECK_TIME" \
    'map(select(.created_at > $since))')

  # Add to state file
  jq -s '.[0] + .[1]' "$STATE_FILE" <(echo "$TRULY_NEW") > "$STATE_FILE.tmp"
  mv "$STATE_FILE.tmp" "$STATE_FILE"

  ITERATION=$((ITERATION + 1))
done

if [ $ITERATION -gt $MAX_ITERATIONS ]; then
  echo "⚠️ Warning: Reached maximum iteration limit ($MAX_ITERATIONS)"
  echo "Some comments may still need manual attention"
fi
```

### Step 6: Comment-Resolver Agent Invocation

For each comment, the agent will:

1. **Categorize** the comment (actionable-clear, actionable-unclear, not-actionable)
2. **Decide action** (fix, reply, skip)
3. **Execute**:
   - If fix: Read file → Edit → Commit → Reply with SHA
   - If reply: Post appropriate response using templates
   - If skip: Log and continue

**Agent invocation pattern:**

```
Agent(workflows:comment-resolver,
  pr_number: "123",
  owner: "iamladi",
  repo: "my-repo",
  comment: {
    "id": 456,
    "type": "review",
    "path": "src/utils.ts",
    "line": 42,
    "body": "Please use const instead of let",
    "user": "reviewer"
  }
)
```

The agent returns:
- `action_taken`: "fix" | "reply" | "skip"
- `commit_sha`: (if fix applied)
- `reply_body`: (if reply posted)
- `status`: "success" | "error"

### Step 7: Fix Application Workflow

When comment-resolver determines a fix is needed:

1. **Read file context**:
   ```
   Read({file-path})
   ```

2. **Apply change**:
   ```
   Edit({file-path}, old_string: "...", new_string: "...")
   ```

3. **Commit with descriptive message**:
   ```bash
   git add {file-path}
   git commit -m "fix: {brief description}

   Addresses review comment from @{reviewer}
   Comment ID: {comment-id}"
   ```

4. **Get commit SHA**:
   ```bash
   COMMIT_SHA=$(git rev-parse --short HEAD)
   ```

5. **Post reply**:
   ```bash
   gh api -X POST "repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments/$COMMENT_ID/replies" \
     -f body="Fixed in ${COMMIT_SHA}"
   ```

### Step 8: Reply Posting Workflow

When comment-resolver determines a reply is needed:

1. **Determine reply type** based on comment category:
   - Clarification needed → Use clarification template
   - Design question → Use explanation template
   - Out of scope → Use deferral template

2. **Format reply** using template:
   ```
   Could you clarify what specific change you're looking for? For example:
   - Should I {option A}?
   - Or {option B}?
   ```

3. **Post via API**:
   ```bash
   # For review comments (file/line level)
   gh api -X POST "repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments/$COMMENT_ID/replies" \
     -f body="$REPLY_TEXT"

   # For issue comments (general PR discussion)
   gh api -X POST "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments" \
     -f body="$REPLY_TEXT"
   ```

### Step 9: Verify Completion

Check that all blocking conditions are cleared:

```bash
# Check for pending CHANGES_REQUESTED reviews
CHANGES_REQUESTED=$(gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" \
  --jq '[.[] | select(.state == "CHANGES_REQUESTED")] | length')

if [ "$CHANGES_REQUESTED" -gt 0 ]; then
  echo "⚠️ Warning: $CHANGES_REQUESTED CHANGES_REQUESTED reviews still pending"
  echo "Reviewers may need to re-review after fixes"
fi

# Check for unresolved comments
UNRESOLVED=$(jq 'length' "$STATE_FILE")

if [ "$UNRESOLVED" -eq 0 ]; then
  echo "✓ All comments addressed"
else
  echo "⚠️ $UNRESOLVED comments still unaddressed"
fi
```

### Step 10: Completion Criteria

All must be true to signal completion:

1. **Zero unaddressed comments** - All top-level comments either fixed or replied to
2. **No pending changes** - No CHANGES_REQUESTED reviews blocking merge
3. **All fixes committed** - Working tree is clean
4. **Replies posted** - All necessary explanations provided

When complete, signal:

```
<phase>COMMENTS_RESOLVED</phase>
```

### Step 11: Final Report

Generate comprehensive summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Comment Resolution Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PR: #{PR_NUMBER} - {PR_TITLE}
Branch: {BRANCH_NAME}
Iterations: {ITERATION_COUNT}

Comment Statistics:
  Total comments fetched: {TOTAL_COUNT}
  Actionable-clear: {CLEAR_COUNT}
  Actionable-unclear: {UNCLEAR_COUNT}
  Not actionable: {NOT_ACTIONABLE_COUNT}

Actions Taken:
  ✓ Fixes applied: {FIX_COUNT}
  💬 Replies posted: {REPLY_COUNT}
  ⏭ Skipped: {SKIP_COUNT}

Files Modified:
  • {file1} ({change-count} changes)
  • {file2} ({change-count} changes)

Commits Created: {COMMIT_COUNT}
  {commit-sha-1} - {commit-message-1}
  {commit-sha-2} - {commit-message-2}
  ...

Review Status:
  ✓ All comments addressed
  {✓ | ⚠️} CHANGES_REQUESTED reviews: {count}

Next Steps:
  1. Review changes: git log --oneline -${COMMIT_COUNT}
  2. Review diffs: git diff {base-branch}..HEAD
  3. Run tests: {test-command if known}
  4. Push changes: git push
  5. Request re-review: gh pr review {PR_NUMBER} --request @{reviewer}

<phase>COMMENTS_RESOLVED</phase>
```

## GitHub API Reference

### Fetch Comments

```bash
# Review comments (file/line level)
GET /repos/{owner}/{repo}/pulls/{pr}/comments

# Review summaries
GET /repos/{owner}/{repo}/pulls/{pr}/reviews

# Issue comments (general PR comments)
GET /repos/{owner}/{repo}/issues/{pr}/comments
```

### Post Replies

```bash
# Reply to review comment
POST /repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies
Body: { "body": "reply text" }

# Add general PR comment
POST /repos/{owner}/{repo}/issues/{pr}/comments
Body: { "body": "comment text" }
```

### Check Review Status

```bash
# Get all reviews
GET /repos/{owner}/{repo}/pulls/{pr}/reviews

# Filter for CHANGES_REQUESTED
jq '[.[] | select(.state == "CHANGES_REQUESTED")]'
```

## Idempotency

This skill is safe to re-run:
- Tracks processed comments in state file
- Skips already-replied comments
- Won't create duplicate commits for same fix
- Detects new comments added during processing

## Error Handling

| Error | Action |
|-------|--------|
| PR not found | Stop with error message |
| PR already merged | Skip processing, signal completion |
| GitHub API rate limit | Wait and retry with exponential backoff |
| File not found in comment | Post reply asking for clarification |
| Fix application fails | Post reply requesting manual intervention |
| Commit fails | Revert changes, post error reply |
| Reply post fails | Log error, continue with next comment |
| Max iterations reached | Generate warning report, signal partial completion |

### Handling New Comments During Processing

If reviewers add comments while processing:
1. Detect new comments after each iteration
2. Add to processing queue
3. Continue loop until queue is empty
4. Max iteration limit prevents infinite loops

### Handling Conflicting Fixes

If multiple comments request changes to same code:
1. Process in chronological order
2. Later fixes may need adjustment for earlier changes
3. Re-read file before each edit to get current state
4. Commit each fix separately for clarity

## Integration with Build Workflow

When invoked from `/workflows:build`:
- Receives PR number from Phase 3 output
- Processes all comments exhaustively
- Signals `<phase>COMMENTS_RESOLVED</phase>` when complete
- Returns list of commits created
- Propagates errors to parent workflow

## Example Usage

**Manual invocation:**
```
/workflows:comment-resolution 123
```

**Expected output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Iteration 1: Processing comments...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found 5 unaddressed comments

Processing comment #789 from @reviewer
File: src/utils.ts:42
Category: actionable-clear
Action: fix

  ✓ Fixed: Changed 'let' to 'const' for maxRetries
  ✓ Committed: abc123f
  ✓ Replied: "Fixed in abc123f"

Processing comment #790 from @reviewer
File: src/api.ts:55
Category: actionable-unclear
Action: reply

  ✓ Replied: "Could you clarify what specific change..."

Processing comment #791 from @maintainer
Category: not-actionable
Action: skip

  ⏭ Skipped: Approval comment

Processing comment #792 from @reviewer
File: src/auth.ts:120
Category: actionable-clear
Action: fix

  ✓ Fixed: Added null check for user.email
  ✓ Committed: def456a
  ✓ Replied: "Fixed in def456a"

Processing comment #793 from @contributor
File: README.md:15
Category: actionable-clear
Action: fix

  ✓ Fixed: Added Docker installation instructions
  ✓ Committed: ghi789b
  ✓ Replied: "Fixed in ghi789b"

Checking for new comments from reviewers...
  ✓ No new comments

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Comment Resolution Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PR: #123 - Add authentication module
Branch: feature/auth
Iterations: 1

Comment Statistics:
  Total comments fetched: 5
  Actionable-clear: 3
  Actionable-unclear: 1
  Not actionable: 1

Actions Taken:
  ✓ Fixes applied: 3
  💬 Replies posted: 4
  ⏭ Skipped: 1

Files Modified:
  • src/utils.ts (1 change)
  • src/auth.ts (1 change)
  • README.md (1 change)

Commits Created: 3
  abc123f - fix: change let to const for maxRetries
  def456a - fix: add null check for user.email
  ghi789b - docs: add Docker installation instructions

Review Status:
  ✓ All comments addressed
  ✓ No CHANGES_REQUESTED reviews remaining

Next Steps:
  1. Review changes: git log --oneline -3
  2. Review diffs: git diff main..HEAD
  3. Run tests: bun test
  4. Push changes: git push
  5. Request re-review: gh pr review 123 --request @reviewer

<phase>COMMENTS_RESOLVED</phase>
```

## Quality Checks

Before signaling completion, verify:
- [ ] All actionable comments processed
- [ ] All fixes committed with descriptive messages
- [ ] All replies posted successfully
- [ ] No pending CHANGES_REQUESTED reviews
- [ ] Working tree is clean
- [ ] State file shows zero unaddressed comments

## What NOT to Do

- Don't skip comments without categorizing them
- Don't commit without applying actual changes
- Don't reply without reading comment context
- Don't proceed if max iterations exceeded
- Don't ignore new comments added during processing
- Don't guess at fixes for unclear comments
- Don't auto-merge the PR (that's a separate decision)

## Safety Mechanisms

- **Iteration limit**: Prevents infinite loops (max 10 iterations)
- **State tracking**: Prevents duplicate processing
- **Validation**: Checks PR exists before processing
- **Error recovery**: Continues on non-fatal errors
- **Commit granularity**: One fix per commit for easy review/revert
- **No auto-push**: Human must review before pushing

## Integration Points

### Input (from build workflow)
```
Skill(workflows:comment-resolution, args: "{pr-number}")
```

### Output Signal
```
<phase>COMMENTS_RESOLVED</phase>
```

### Agent Dependency
- Requires `workflows:comment-resolver` agent
- Agent must be available and operational

### GitHub CLI Dependency
- Requires `gh` CLI authenticated
- Requires API access to repository

## Performance Notes

- **API calls**: Approx 3 calls per iteration (fetch reviews, review comments, issue comments)
- **Rate limiting**: Built-in retry with backoff
- **Typical runtime**:
  - 1-5 comments: ~30 seconds
  - 5-15 comments: 1-2 minutes
  - 15+ comments: 2-5 minutes
- **Max iterations**: 10 (safety limit)

Remember: This skill runs autonomously but creates commits for human review. The goal is exhaustive resolution, not speed.
