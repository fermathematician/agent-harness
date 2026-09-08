# agent-harness-template

## About this project

This repository is a template for setting up an agent harness around the
`pi-coding-agent` (npm package `@earendil-works/pi-coding-agent`) in a project
workspace. It provides the configuration, prompts, and safety guardrails
needed to work with an AI coding agent in a controlled, auditable way.

Key components:

- `AGENTS.md` — general guidelines for agents working in this repository:
  understand the code before changing it, keep changes focused, preserve
  existing behavior, and verify with tests before declaring a task complete.
- `.pi/` — pi agent configuration:
  - `prompts/` — workflow prompt templates:
    - `plan-instructions.md` — read-only planning workflow;
    - `execute-instructions.md` — implementation workflow with Git-safety
      rules and a structured completion report;
    - `review.md` and `debug.md` — code review and debugging workflows.
  - `extensions/` — safety extensions:
    - `audit.ts` — records every tool call to `.pi/audit/tool-calls.jsonl`,
      stamping each event with `sessionBaseCommit`, the current Git HEAD
      read by the harness itself;
    - `safety.ts` — implements the `/plan` and `/execute` commands, read-only
      plan mode, blocking of Git write operations, protection of the
      `.pi/extensions` directory itself, and bash command guardrails
      (allowlist/denylist).
  - `skills/` — placeholder for custom skills.
- `evals/` — session evaluation of agent behavior:
  - `session-eval.ts` — reads the audit log (`.pi/audit/tool-calls.jsonl`),
    groups events into sessions by `sessionBaseCommit`, and computes
    per-session metrics: read-before-edit ratio, `git status` / `git diff`
    checks, test and typecheck execution and pass status, tool errors, and
    counts of files read, files changed, and bash invocations.
  - `results/session-evals.jsonl` — generated output: one JSON object per
    evaluated session.
- `src/`, `tests/`, `scripts/`, `docs/` — placeholder directories to
  be filled in with the actual project code.

Safety model:

1. **Plan before editing.** `/plan <task>` switches the agent into read-only
   mode: only allowlisted inspection commands are permitted and file
   modifications are blocked.
2. **Execute deliberately.** `/execute <task>` restores the normal development
   tools and applies the execution workflow, ending with a completion report
   and a suggested Conventional Commit message.
3. **Humans control Git.** The agent may inspect the repository with
   read-only Git commands (`git status`, `git diff`, `git log`, `git show`),
   but never stages, commits, pushes, or rewrites history.
4. **Everything is audited.** All tool calls are logged to
   `.pi/audit/tool-calls.jsonl`, which is ignored by Git. Every event also
   carries `sessionBaseCommit`, the Git HEAD at the time of the event; since
   the agent cannot commit, a change of that value in the log marks a
   session boundary created by a human commit.
