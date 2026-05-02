---
name: session-export
description: Summarize the current AI session into a Markdown file for later reference. Use when the user wants a saved session summary, implementation recap, research note, or handoff document.
---

# Session Export

Create a structured Markdown summary of the current session and write it to disk.

## When To Use

- the user wants a saved recap of what happened
- the session produced implementation work worth preserving
- the session gathered research or decisions that should be reusable later
- the user wants a handoff note for future work

## Goals

- capture the important outcome, not every turn
- preserve decisions, changes, and open questions
- make the file useful to someone reading it later without chat context

## Workflow

### 1. Decide the target file

If the user provides a path or filename, use it.

Otherwise use this default path under the current project:

`.agents/session/session-summary/<slug>-<timestamp>.md`

Prefer a project-local path over a temp path.

Use these naming rules:

- `<slug>` must be short, readable, and lowercase kebab-case
- derive `<slug>` from the main session goal, task, or feature name
- keep `<slug>` to roughly 3-6 words when possible
- `<timestamp>` should use `YYYY-MM-DD-HHMM`

Example:

- `.agents/session/session-summary/pi-cleanup-2026-05-02-1545.md`

### 2. Gather the important information

Summarize only the high-signal parts:

- the user’s goal
- the key decisions made
- the files changed
- the main implementation steps taken
- verification performed
- remaining risks, follow-ups, or open questions

Do not turn the export into a raw transcript.

### 3. Write the document

Use a compact structure like:

```markdown
# Session Summary

## Metadata

Optional:

- title
- date
- agent
- model

## Goal

## Outcome

## Key Decisions

## Changes Made

## Verification

## Open Items
```

Adapt the headings if the session was more research-heavy or more implementation-heavy.

### 4. Sanitize sensitive data

Before writing the file, remove or redact anything sensitive.

Never include:

- API keys
- tokens
- passwords
- private credentials
- real environment variable values
- internal-only hostnames if they should not be shared

Use placeholders like:

- `<REDACTED>`
- `$ENV_VAR_NAME`

### 5. Confirm the result

After writing the file, report:

- the saved path
- a 1-3 sentence summary of what was captured

## Quality Bar

- The summary should be understandable without reading the conversation.
- It should emphasize outcomes and decisions over chronology.
- It should mention verification honestly.
- It should clearly separate completed work from follow-up work.
- It must not leak secrets, tokens, or sensitive local configuration.
