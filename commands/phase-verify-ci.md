# Phase: Verify CI

Check CI status for the pull request.

## Arguments

`$ARGUMENTS` - PR number

## Steps

### 1. Poll CI Status

Use GitHub CLI to check PR checks:

```bash
gh pr checks $ARGUMENTS --json name,state,conclusion
```

### 2. Evaluate Status

Parse the check results:
- If ALL checks have `conclusion: success` → CI passed
- If ANY check has `conclusion: failure` → CI failed
- If ANY check has `state: pending` → wait and re-poll

### 3. Wait for Pending (if needed)

If checks are still running:
- Wait 30 seconds
- Re-poll (up to 10 times, 5 minutes total)
- If still pending after 5 minutes, report pending state

### 4. Collect Failure Details

If CI failed, gather:
- Which check(s) failed
- Failure logs/summary
- Relevant error messages

```bash
gh pr checks $ARGUMENTS --json name,state,conclusion,link
```

### 5. Emit Signal

On success:
```
<phase>CI_PASSED</phase>
```

On failure:
```
<phase>CI_FAILED</phase>
ci_failure_reason: {check_name}: {summary}
```

## Output Format

On CI passing:
```
CI Status: All checks passed ✓

Checks:
- build: success
- test: success
- lint: success

<phase>CI_PASSED</phase>
```

On CI failing:
```
CI Status: Failed

Checks:
- build: success
- test: failure ← 3 tests failed
- lint: success

Failed Check Details:
- test: src/auth/login.test.ts - expected 200, got 401

<phase>CI_FAILED</phase>
ci_failure_reason: test: 3 tests failed in auth module
```

On CI pending (timeout):
```
CI Status: Still pending after 5 minutes

Checks:
- build: success
- test: pending
- lint: pending

Will retry in next iteration.
<phase>CI_FAILED</phase>
ci_failure_reason: Checks still pending after timeout
```
