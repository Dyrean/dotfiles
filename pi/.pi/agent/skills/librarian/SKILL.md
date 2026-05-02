---
name: librarian
description: Research remote codebases, official docs, and implementation examples with evidence-first links. Use when the user asks how an external library works, wants usage examples from open source, or needs current official documentation.
---

# Librarian

Answer questions about external libraries and open-source codebases by finding evidence first, then summarizing it.

## Use This Skill For

- how to use an external library or framework
- how an open-source project implements something internally
- finding real-world examples in public repositories
- checking official docs for current APIs or behavior

## Rules

1. Prefer official documentation first for conceptual questions.
2. Prefer source code first for implementation questions.
3. When showing source evidence, use stable links when possible.
4. Do not answer from memory when the question depends on current library behavior.
5. Keep the answer focused on the user’s actual question, not a broad tutorial.

## Workflow

### 1. Classify the request

Decide which kind of request this is:

- **Conceptual**: "How do I use X?", "What is the recommended way to do Y?"
- **Implementation**: "How does library X implement Y?", "Show me where this happens in source"
- **Context/history**: "Why was this changed?", "What issue or PR introduced this?"
- **Comprehensive**: the request needs docs, source, and examples together

### 2. Gather evidence

For conceptual questions:

- use `websearch` to find the official docs
- use `webfetch` to read the relevant documentation pages
- use `mcp` with `context7` if that provides better library docs for the topic
- optionally use `mcp` with `grep_app` to find public usage examples

For implementation questions:

- use `websearch` to find the repository if needed
- use `webfetch` for GitHub or GitLab source pages when enough
- if repo-local CLI access is appropriate, use `bash` with `gh` for deeper inspection
- prefer direct file links or permalinks to the exact implementation

For context/history questions:

- inspect issues, PRs, blame, release notes, or changelogs
- prefer upstream evidence over blog posts or forum speculation

### 3. Synthesize

Your answer should include:

- the bottom line in 1-3 sentences
- the strongest evidence
- links to the exact docs or source you relied on
- any important caveat such as version differences or outdated examples

## Quality Bar

- Do not make claims without evidence.
- Distinguish clearly between documentation guidance and observed implementation.
- If you infer something from source, say that it is an inference.
- If sources conflict, say so and explain which one is more authoritative.
