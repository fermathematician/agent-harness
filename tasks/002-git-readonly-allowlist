/plan

Task 002 — Replace the Git mutation denylist with a read-only Git allowlist.

Goal:
The agent must be able to inspect the repository with Git, but must never be able to mutate Git state, staging, refs, configuration, remotes, or history.

Current safety.ts blocks a list of known dangerous Git commands. This is insufficient because Git plumbing commands such as update-ref, commit-tree, update-index, symbolic-ref, and similar commands may bypass a denylist.

Design a safer policy based on an allowlist: when a bash command invokes Git, only explicitly approved read-only Git operations should be allowed. Everything else should be blocked by default.

At minimum, consider these read-only operations:

- git status
- git diff
- git log
- git show
- git rev-parse
- git ls-files
- git ls-tree
- git remote -v

Requirements:

- Inspect the current safety guardrail, audit implementation, tests, and relevant documentation.
- Identify bypasses or edge cases in the current Git protection.
- Propose the exact allowlist policy and matching strategy.
- Consider Git global options, command chaining, shell syntax, aliases, plumbing commands, and commands that appear read-only but may have side effects.
- Preserve legitimate repository inspection needed by /plan and /execute.
- Preserve explicit audit events for blocked Git mutations.
- Define the tests needed to prove allowed Git inspection still works and mutation attempts are blocked.
- Do not modify any files.
- Do not attempt to bypass the protected .pi/extensions/ path.
- If implementation requires changes to protected files, identify the exact files and changes for the human to apply manually.
- Keep the plan focused on this task only.
