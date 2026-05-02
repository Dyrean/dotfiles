---
name: commit
description: Stage changes safely and create a clean Conventional Commit. Use when the user asks to commit current work, make an atomic commit, or write a commit message for the current changes.
---

# Commit

Create a clean, atomic git commit with a Conventional Commit message.

## Goals

- avoid accidentally committing secrets or unrelated files
- keep commits focused on one logical change
- write a concise subject and short useful body

## Workflow

### 1. Inspect the working tree

Start with:

- `git status`
- `git diff --stat`
- `git diff --staged --stat` if anything is already staged

If there are no changes, stop and say there is nothing to commit.

### 2. Apply safety checks

Look for suspicious untracked files before staging anything:

- `.env`
- `*.pem`
- `*.key`
- credential dumps
- local secrets or tokens

If something looks sensitive, stop and warn the user instead of committing.

### 3. Check atomicity

Decide whether the changes are one logical unit.

If the diff contains unrelated work:

- tell the user it should be split
- propose the split in plain terms
- do not force everything into one commit

### 4. Stage selectively

Prefer:

- `git add -u` for tracked modifications
- `git add <specific-file>` for targeted staging

Avoid `git add .` unless the tree is already clearly clean and intentional.

### 5. Write the commit message

Use Conventional Commits:

- `feat:`
- `fix:`
- `docs:`
- `refactor:`
- `test:`
- `chore:`

Format:

```text
<type>(<scope>): <subject>

<body>
```

Rules:

- subject should be short and concrete
- body should explain what changed and why
- do not include secrets
- do not add a body if it adds no value

### 6. Commit

Run `git commit` with a non-interactive message.

Because this Pi setup includes git interception, do not try to bypass hooks and do not use `--no-verify`.

## Final Response

After committing, report:

- the commit subject
- a short summary of what was committed
- the resulting commit hash if available

If you did not commit, say exactly why.
