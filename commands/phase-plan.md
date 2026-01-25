# Phase: Planning

Generate implementation plans from research document.

## Arguments

`$ARGUMENTS` - Path to research file

## Steps

### 1. Read Research File

Read the research document to understand the full scope of work.

### 2. Invoke Plan-Split Skill

Use the plan-splitter agent to analyze and split the research:

```
/workflows:plan-split $ARGUMENTS
```

This skill will:
- Analyze the research document
- Score each task by complexity (using the standard formula)
- Group tasks into plans (each ≤ 5 complexity)
- Generate plan files in `plans/` directory
- Create GitHub issues for each plan

### 3. Validate Plans Generated

After the skill completes:
- Count the number of plan files created
- Verify each plan has a GitHub issue number
- Update progress file with plan list

### 4. Update Progress File

Add the generated plans to the progress file:

```
## Plans
total: {count}
completed: 0
- [ ] plans/workflow-1-{slug}.md (issue: #N)
- [ ] plans/workflow-2-{slug}.md (issue: #N) <- CURRENT
...
```

### 5. Emit Signal

```
<phase>PLANNING_COMPLETE</phase>
plans_count: {number}
```

## Error Handling

If plan generation fails:
```
<promise>FAILED</promise>
<error>Planning failed: {reason}</error>
```

If no plans generated (empty research):
```
<promise>FAILED</promise>
<error>No plans generated from research file</error>
```

## Output Format

On success:
```
Planning complete.
Generated {N} implementation plans.

Plans:
1. plans/workflow-1-setup-auth.md (issue: #42)
2. plans/workflow-2-implement-login.md (issue: #43)
3. plans/workflow-3-add-tests.md (issue: #44)

<phase>PLANNING_COMPLETE</phase>
plans_count: 3
```
