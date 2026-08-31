# Execute

Implement the requested change following the repository instructions and the approved plan, when one exists.

## Before modifying code

1. Read the relevant existing files and understand the current implementation.
2. Confirm the scope of the requested change.
3. Follow the existing architecture, conventions, and patterns unless there is a clear reason not to.
4. Keep the implementation focused on the requested task.
5. Do not introduce new dependencies without justification.
6. If an approved plan exists in the current context, use it as the basis for the implementation.
7. If the task conflicts with the approved plan in a meaningful way, stop and explain the conflict before proceeding.

## During implementation

1. Make the smallest reasonable set of changes required to complete the task.
2. Prefer simple, readable, and maintainable code over clever or unnecessarily abstract solutions.
3. Preserve existing behavior unless the task explicitly requires changing it.
4. Consider relevant edge cases, failure modes, and error handling.
5. Add or update tests for changed behavior.
6. Never weaken, remove, skip, or modify a valid test merely to make the implementation pass.
7. Do not make unrelated changes.
8. Do not silently expand the scope of the task.
9. If you discover a separate issue, report it instead of fixing it unless it blocks the requested task.

## Execution discipline

- Execute the approved plan directly when the implementation is already clear.
- Do not reopen decisions that were already resolved during planning unless new evidence reveals a meaningful problem.
- Keep investigation and reasoning proportional to the complexity and risk of the task.
- For simple, well-specified changes, prefer a short execution cycle:
  inspect → modify → verify → report.
- Do not sacrifice correctness, testing, or safety for brevity.

## Verification

After implementing:

1. Run the relevant tests.
2. If tests fail:
   - investigate the root cause;
   - distinguish the cause from symptoms;
   - fix the implementation rather than masking the failure;
   - run the tests again.
3. Run relevant linting, type checking, formatting checks, or static analysis already configured in the repository.
4. Do not introduce new tooling solely to satisfy this verification step unless justified by the task.
5. Review the final diff.
6. Check `git status`.
7. Verify that no unintended or unrelated files were changed.
8. Verify that the implementation still matches the requested scope.

Do not claim that a check passed unless you actually executed it.

## Git safety

Git history and repository publication are human-controlled checkpoints.

You may inspect the repository using read-only Git commands such as:

- `git status`
- `git diff`
- `git diff --staged`
- `git log`
- `git show`

You must NEVER:

- run `git add`;
- run `git commit`;
- run `git push`;
- run `git pull`;
- run `git merge`;
- run `git rebase`;
- run `git reset`;
- run `git revert`;
- run `git cherry-pick`;
- run `git stash`;
- create, rename, switch, or delete branches;
- create or delete tags;
- modify Git configuration;
- modify Git hooks;
- modify Git history;
- stage files;
- publish repository changes to any remote.

Do not use another command, script, library, API, or tool to perform an equivalent Git operation indirectly.

If completing the task would require one of these operations, stop and report what would be required.

You may suggest a commit message, but you must never create the commit.

## Completion report

Before declaring the task complete, provide the following sections.

### What changed

Briefly describe:

- what was implemented;
- the important implementation decisions;
- why those decisions were made.

### Files changed

List every file created, modified, or deleted and briefly explain why it changed.

### Verification

Report every relevant verification command actually executed and its result.

Examples:

- `pytest` — 24 passed
- `npm test` — passed
- `npm run lint` — passed
- `mypy src/` — passed

If a relevant check could not be executed, state that explicitly and explain why.

### Diff review

Confirm that you reviewed the final diff.

Report:

- whether the diff contains only changes related to the task;
- any surprising or particularly important changes;
- whether any unintended files were modified.

### Git status

Summarize the final working-tree state without staging or committing anything.

### Remaining risks or uncertainties

List any:

- known limitations;
- assumptions;
- unresolved questions;
- untested behavior;
- areas that could not be verified.

If there are none, state that explicitly.

### Suggested commit

Suggest exactly one Conventional Commit message describing the completed change.

Use the format:

`<type>(<scope>): <description>`

Prefer these types:

- `feat` — new functionality
- `fix` — bug fix
- `refactor` — code restructuring without behavior change
- `test` — adding or improving tests
- `docs` — documentation changes
- `perf` — performance improvement
- `build` — build system or dependency changes
- `ci` — CI/CD changes
- `chore` — maintenance that does not fit another type

Choose a short, meaningful scope based on the affected component.

Examples:

- `feat(auth): add JWT authentication`
- `fix(api): handle missing customer id`
- `test(prime): add edge case coverage`
- `refactor(parser): simplify validation flow`
- `perf(search): reduce lookup overhead`

Do not create the commit.
Do not stage files.
Only suggest the commit message.
