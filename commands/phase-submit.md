# Phase: Submit PR

Create and push the pull request.

## Arguments

None - reads context from progress file.

## Steps

### 1. Read Progress File

Parse `.workflow-progress.txt` to get:
- Research file (for PR description context)
- Plans list (for PR body)
- Branch name

### 2. Verify Ready to Submit

Check that:
- All plans are marked complete
- No uncommitted changes
- Branch is ahead of main

```bash
git status
git log main..HEAD --oneline
```

### 3. Create Pull Request

Invoke the GitHub create-pr skill:

```
/github:create-pr
```

This will:
- Generate PR title from branch/commits
- Create comprehensive PR body with:
  - Summary of changes
  - List of implemented plans
  - Test plan
  - Links to issues
- Push to remote and create PR

### 4. Capture PR Info

Extract from the output:
- PR number
- PR URL

### 5. Update Progress File

```
## PR
number: {pr_number}
url: {pr_url}
ci_status: pending
ci_attempts: 0
```

### 6. Emit Signal

```
<phase>PR_CREATED</phase>
pr_number: {number}
pr_url: {url}
```

## Error Handling

If PR creation fails:
```
<promise>FAILED</promise>
<error>PR creation failed: {reason}</error>
```

If already has PR (resuming):
- Read existing PR number from progress
- Skip creation, emit signal anyway

## Output Format

On success:
```
Pull request created successfully!

PR #123: feat: implement authentication system
URL: https://github.com/org/repo/pull/123

Plans included:
- #42: Setup auth infrastructure
- #43: Implement login flow
- #44: Add test coverage

Waiting for CI...

<phase>PR_CREATED</phase>
pr_number: 123
pr_url: https://github.com/org/repo/pull/123
```
