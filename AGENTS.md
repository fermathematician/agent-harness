# Agent Instructions

## General

- Understand the relevant existing code before modifying it.
- Prefer simple solutions over unnecessary abstractions.
- Follow the existing architecture and conventions unless there is a clear reason not to.
- Do not introduce new dependencies without justification.
- Do not make unrelated changes.

## Implementation

- Keep changes focused on the requested task.
- Prefer clear and maintainable code over clever code.
- Preserve existing behavior unless the task explicitly requires changing it.
- Consider failure modes and edge cases.

## Testing

- Run the relevant tests after modifying code.
- Add or update tests when behavior changes.
- Never modify or remove a valid test merely to make an implementation pass.
- Do not hide failures or weaken assertions.

## Debugging

- Investigate the root cause before applying a fix.
- Prefer fixing the cause rather than masking the symptom.
- When uncertain, gather evidence instead of guessing.

## Completion

Before declaring a task complete:

1. Run the relevant tests.
2. Review the resulting diff.
3. Check for unintended changes.
4. Report what changed and any remaining risks or uncertainties.
