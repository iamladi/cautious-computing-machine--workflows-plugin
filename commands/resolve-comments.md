---
description: Resolve all PR comments exhaustively - fixes actionable comments and posts replies to others
---

# Resolve Comments

Automatically resolve ALL comments on a pull request. This command fetches review comments, categorizes them, applies fixes or posts replies, and handles reviewer back-and-forth until all comments are addressed.

## Arguments

- `$ARGUMENTS` - PR number (e.g., `123`) or full PR URL (required)

## Usage

```
/workflows:resolve-comments 123
/workflows:resolve-comments https://github.com/owner/repo/pull/123
```

## What It Does

This command invokes the comment-resolution skill to:

1. Fetch ALL comment types (review comments, review summaries, issue comments)
2. Categorize each comment (actionable-clear, actionable-unclear, not-actionable)
3. Apply fixes for clear actionable comments
4. Post clarifying replies for unclear comments
5. Skip non-actionable comments
6. Check for new comments from reviewers
7. Repeat until all comments are addressed

The skill runs autonomously but creates commits for human review before pushing.

## Implementation

### Step 1: Validate Arguments

Check if PR number/URL provided:

```
if $ARGUMENTS is empty:
  Error: No PR number provided
  Usage: /workflows:resolve-comments <pr-number or url>
  Example: /workflows:resolve-comments 123
  stop
```

### Step 2: Invoke Skill

Pass the PR argument to the comment-resolution skill:

```
Skill(workflows:comment-resolution, args: "$ARGUMENTS")
```

The skill handles:
- Parsing PR number from URL if needed
- Checking out PR branch
- Fetching comments from GitHub API
- Processing comments via comment-resolver agent
- Applying fixes and posting replies
- Iterating until completion
- Generating final report

### Step 3: Report Completion

The skill emits `<phase>COMMENTS_RESOLVED</phase>` when done and provides a detailed summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Comment Resolution Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PR: #{number} - {title}
Iterations: {count}

Actions Taken:
  ✓ Fixes applied: {count}
  💬 Replies posted: {count}
  ⏭ Skipped: {count}

Files Modified:
  • {file1} ({change-count} changes)
  • {file2} ({change-count} changes)

Commits Created: {count}
  {sha1} - {message1}
  {sha2} - {message2}

Next Steps:
  1. Review changes: git log --oneline -{count}
  2. Review diffs: git diff {base}..HEAD
  3. Run tests: {test-command}
  4. Push changes: git push
  5. Request re-review from reviewers
```

## Error Handling

### No PR Number Provided

```
Error: No PR number provided

Usage: /workflows:resolve-comments <pr-number or url>

Examples:
  /workflows:resolve-comments 123
  /workflows:resolve-comments https://github.com/owner/repo/pull/123
```

### PR Not Found

```
Error: PR #123 not found

Verify:
  - PR exists in this repository
  - You have access to the PR
  - PR number is correct
```

### Not Authenticated

```
Error: GitHub CLI not authenticated

Run: gh auth login
```

### PR Already Merged

```
PR #123 is already merged. No comment resolution needed.
```

## Integration

Can be invoked:
- **Manually** by user: `/workflows:resolve-comments 123`
- **Programmatically** from build workflow (Phase 4)
- **Programmatically** from other commands/skills

## Notes

- Creates commits locally but does NOT push automatically
- Human must review changes before pushing
- Handles reviewer back-and-forth (new comments added during processing)
- Max 10 iterations to prevent infinite loops
- Skips bot comments and own replies
- All heavy lifting done by comment-resolution skill
