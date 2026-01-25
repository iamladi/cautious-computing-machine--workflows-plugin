# Phase: Resolve PR Comments

Check for and resolve all PR review comments.

## Arguments

`$ARGUMENTS` - PR number

## Steps

### 1. Fetch All Comments

Get all comment types from the PR:

```bash
# Review comments (inline)
gh api repos/{owner}/{repo}/pulls/{pr}/comments

# Review summaries
gh api repos/{owner}/{repo}/pulls/{pr}/reviews

# Issue comments (general)
gh api repos/{owner}/{repo}/issues/{pr}/comments
```

### 2. Filter Actionable Comments

Exclude:
- Bot comments (author is bot)
- Own comments (author is PR author)
- Already addressed comments (resolved/outdated)

### 3. Categorize Comments

For each comment, determine:
- **actionable-clear**: Has specific code change request
- **actionable-unclear**: Needs clarification
- **not-actionable**: Question, praise, or FYI

### 4. Process Each Comment

Invoke the comment resolver skill:

```
/workflows:resolve-comments $ARGUMENTS
```

This will:
- Apply code fixes for clear actionable comments
- Post clarifying questions for unclear comments
- Post acknowledgment for informational comments

### 5. Check for New Comments

After processing, check if reviewers added new comments:

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments --jq 'map(select(.updated_at > "{last_check}"))'
```

### 6. Determine Completion

Comments are resolved when:
- All actionable comments have been addressed
- No new comments from reviewers in last check
- OR maximum iterations reached

### 7. Emit Signal

All resolved:
```
<phase>COMMENTS_RESOLVED</phase>
```

Still pending (new comments or unresolved):
```
<phase>COMMENTS_PENDING</phase>
pending_count: {number}
```

## Output Format

On all resolved:
```
Comment Resolution Complete

Processed:
- 3 comments fixed with code changes
- 1 comment replied with explanation
- 2 comments acknowledged

No pending comments.

<phase>COMMENTS_RESOLVED</phase>
```

On pending:
```
Comment Resolution In Progress

Processed this iteration:
- Fixed: 2 comments
- Replied: 1 comment

Still pending:
- 2 new comments from @reviewer since last check

<phase>COMMENTS_PENDING</phase>
pending_count: 2
```

On failure:
```
Comment Resolution Failed

Unable to process:
- Comment #42: Requires architectural decision

<promise>FAILED</promise>
<error>Comment requires manual decision: architectural change requested</error>
```
