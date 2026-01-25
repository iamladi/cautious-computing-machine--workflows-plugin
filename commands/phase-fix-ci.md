# Phase: Fix CI

Analyze and fix CI failures.

## Arguments

`$ARGUMENTS` - PR number

## Steps

### 1. Get Failure Details

Fetch the CI failure logs:

```bash
gh pr checks $ARGUMENTS --json name,state,conclusion,link
```

For failed checks, get the run logs:

```bash
gh run view {run_id} --log-failed
```

### 2. Analyze Failures

Parse the failure logs to identify:
- Test failures: file, test name, expected vs actual
- Build errors: file, line, error message
- Lint errors: file, line, rule violated
- Type errors: file, line, type mismatch

### 3. Invoke CI Fix Skill

Use the specialized CI fix agent:

```
/github:fix-ci
```

This agent will:
- Analyze each failure type
- Apply appropriate fixes
- Run local verification
- Commit fixes with descriptive message

### 4. Push Fixes

After fixes are applied and verified locally:

```bash
git push
```

### 5. Emit Signal

```
<phase>CI_FIX_PUSHED</phase>
```

## Error Handling

If fix attempt fails:
```
<promise>FAILED</promise>
<error>CI fix failed: {reason}</error>
```

If same error persists after fix:
- Log the pattern
- May indicate deeper issue
- Continue to next attempt (runner handles retries)

## Output Format

On success:
```
CI Fix Applied

Failures analyzed:
1. test: auth/login.test.ts - Fixed assertion
2. lint: routes.ts - Fixed unused import

Changes:
- Fixed test assertion in auth/login.test.ts
- Removed unused import in routes.ts

Committed: "fix: resolve CI failures in auth module"
Pushed to remote.

<phase>CI_FIX_PUSHED</phase>
```

On failure:
```
CI Fix Failed

Unable to resolve:
- build: Missing dependency 'some-package'
  (Requires manual intervention - package not in registry)

<promise>FAILED</promise>
<error>CI fix requires manual intervention: missing dependency</error>
```
