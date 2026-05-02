---
name: review
description: Perform a rigorous code review focused on correctness, security, regressions, and missing tests. Use when the user asks for a review, PR feedback, or an audit of current changes or a specific diff.
---

# Review

Perform a practical, high-signal code review.

## Primary Goal

Find the things that would matter before merge:

- correctness bugs
- behavioral regressions
- security issues
- bad edge-case handling
- missing or weak tests
- maintainability problems that materially increase risk

## Review Rules

1. Prioritize correctness over style.
2. Do not spend time on formatting unless it affects comprehension or behavior.
3. Understand the intent of the change before judging it.
4. Focus on issues introduced by the reviewed change, not unrelated pre-existing code.
5. Keep findings concrete and actionable.

## Scope Selection

Choose the review scope in this order:

1. If the user gives a PR or MR reference, review that change.
2. Otherwise review uncommitted local changes.
3. If the tree is clean, review the last commit.

Useful starting commands:

- `git status`
- `git diff HEAD`
- `git show --stat --summary HEAD`

## Review Process

### 1. Understand the change

Before listing findings:

- read the diff
- identify the purpose of the change
- inspect the most important touched files
- read surrounding code where necessary

If the intent is unclear, say so explicitly.

### 2. Evaluate risk areas

Check for:

- incorrect assumptions or logic errors
- invalid state transitions
- missing input validation
- unsafe shell or filesystem behavior
- broken async or concurrency behavior
- error handling gaps
- partial updates or inconsistent persistence
- interface or API contract drift
- missing migration or rollout concerns
- insufficient tests for the risky logic

### 3. Validate claims against code

Do not speculate vaguely.

For every finding, point to:

- the file
- the relevant line or code region
- the concrete failure mode

### 4. Summarize residual risk

If no findings are present, say so clearly, then mention:

- any areas you could not fully validate
- tests you did not run
- assumptions that still carry risk

## Output Format

Present findings first, ordered by severity.

For each finding include:

- file path
- severity
- the issue
- why it matters

After findings, optionally include:

- open questions
- a short change summary
- testing gaps

## Severity Guide

- **High**: likely bug, security issue, data loss, or serious regression
- **Medium**: meaningful reliability or maintainability risk
- **Low**: smaller issue worth fixing but not likely a blocker

## Final Constraint

If you are asked for a review, do not default into implementation mode.
Review first. Only propose or make changes if the user explicitly asks for fixes after the review.
