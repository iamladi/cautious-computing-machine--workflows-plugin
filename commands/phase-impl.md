# Phase: Implementation

Execute a single implementation plan.

## Arguments

`$ARGUMENTS` - Path to the plan file (e.g., `plans/workflow-1-setup-auth.md`)

## Steps

### 1. Read Plan File

Read the plan file to understand:
- Tasks to implement
- Dependencies
- Acceptance criteria
- GitHub issue number

### 2. Execute Implementation

Invoke the sdlc implement skill:

```
/sdlc:implement $ARGUMENTS
```

This will:
- Execute the plan in TDD mode (if configured)
- Create commits for each significant change
- Run tests to verify implementation
- Link commits to the GitHub issue

### 3. Verify Implementation

After implementation:
- Check all tests pass
- Verify no linting errors
- Confirm changes match plan requirements

### 4. Update Progress File

Mark the plan as completed:

```
- [x] $ARGUMENTS (issue: #N)
```

Increment the `completed` count.

### 5. Emit Signal

For individual plan completion:
```
<plan>PLAN_N_COMPLETE</plan>
```

After ALL plans are done:
```
<phase>IMPLEMENTATION_COMPLETE</phase>
```

## Decision Logic

- If this is the last plan → emit `IMPLEMENTATION_COMPLETE`
- If more plans remain → emit `PLAN_N_COMPLETE` where N is the plan number

Check the progress file to determine:
```
completed: X
total: Y
```

If X == Y after this plan, this is the last one.

## Error Handling

If implementation fails:
```
<promise>FAILED</promise>
<error>Implementation failed: {reason}</error>
```

## Output Format

On success (not last plan):
```
Plan implemented successfully: $ARGUMENTS

Changes:
- Created src/auth/login.ts
- Added tests in tests/auth/login.test.ts
- Updated routes in src/routes.ts

<plan>PLAN_1_COMPLETE</plan>
```

On success (last plan):
```
Plan implemented successfully: $ARGUMENTS

All plans complete!
<plan>PLAN_3_COMPLETE</plan>
<phase>IMPLEMENTATION_COMPLETE</phase>
```
