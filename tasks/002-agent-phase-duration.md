# Task 002 — Agent Phase Duration

## Goal

Correct the phase duration metrics so they represent the time the agent actually spends working in PLAN and EXECUTE, rather than including human idle time between phases.

The Run-level duration must continue representing the total wall-clock lifetime of the Run.

## Problem

The current evaluator measures PLAN duration using the lifecycle boundary:

`phase_change(plan) → phase_change(execute)`

This includes time after the PLAN agent has finished working but before the user manually starts `/execute`.

For example, in a clean observed Run:

- PLAN agent activity took approximately 51 seconds.
- The user waited several minutes before starting `/execute`.
- The dashboard reported approximately 7m37s for PLAN.
- EXECUTE took approximately 49 seconds.
- Total Run wall-clock duration was approximately 8m26s.

The PLAN metric therefore does not currently represent agent execution time.

## Desired semantics

### Run duration

Keep Run duration as wall-clock time.

For a completed V1 Run:

`run_start → run_complete`

Human idle time between PLAN and EXECUTE remains part of Run duration.

### PLAN duration

PLAN duration should represent the agent's actual activity during the PLAN phase.

Human idle time after PLAN work has finished and before `/execute` starts must not be included.

Use existing audit timestamps to derive this metric if they provide enough information.

### EXECUTE duration

EXECUTE duration should represent the agent's actual activity during the EXECUTE phase.

Do not include unrelated idle time outside actual agent execution.

## Important distinction

The metrics should answer two different questions:

- Run duration: how long did the Run exist from start to completion?
- Phase duration: how long did the agent actually work in that phase?

These concepts must remain separate.

## Example

Given a Run conceptually shaped like:

`/plan → ~51s agent activity → human idle → /execute → ~49s agent activity → complete`

The expected metrics are approximately:

- Run duration: ~8m26s
- PLAN duration: ~51s
- EXECUTE duration: ~49s

The exact values must be derived from audit timestamps rather than hardcoded.

## Investigation requirements

Before implementing:

- inspect the current lifecycle implementation;
- inspect the audit event structure;
- inspect the evaluator timing logic;
- inspect existing timing tests;
- inspect dashboard aggregation and presentation of phase durations;
- determine which existing audit events can reliably define agent activity boundaries.

Prefer using existing telemetry.

Do not introduce new lifecycle events or audit schema fields unless the existing data is insufficient.

## Implementation constraints

Make the smallest change that produces correct metric semantics.

Do not change:

- the definition of a Run;
- PLAN → EXECUTE Run correlation;
- Run completion semantics;
- Run status semantics;
- guardrail behavior;
- Git policy;
- protected `.pi/extensions` unless strictly required.

Do not add dependencies.

Do not stage or commit files.

## Compatibility

Preserve existing behavior where it remains semantically correct.

Legacy audit records must continue to be handled safely.

Missing phase information must not become misleading zero-duration values.

If an agent duration cannot be derived reliably, prefer `null` over inventing a duration.

## Tests

Add or update tests covering at minimum:

- PLAN followed immediately by EXECUTE;
- PLAN with substantial human idle time before EXECUTE;
- EXECUTE duration;
- completed Run wall-clock duration remains unchanged;
- PLAN-only active Run;
- direct EXECUTE Run;
- missing or incomplete phase data;
- legacy records where applicable.

Include a test where the gap between the last PLAN activity and `phase_change(execute)` is large enough to prove that human idle time is excluded.

## Dashboard

The dashboard must continue displaying:

- Run duration;
- average PLAN duration;
- average EXECUTE duration.

Run duration must remain wall-clock.

PLAN and EXECUTE duration must reflect the corrected agent-duration semantics.

Do not duplicate timing semantics in the UI. Metric derivation belongs in the evaluator/domain layer.

## Verification

Run:

`npm test`

and:

`npx tsc --noEmit`

Both must pass.

## Definition of Done

The task is complete when:

- Run duration still measures wall-clock Run lifetime;
- PLAN duration excludes human idle time between PLAN completion and `/execute`;
- EXECUTE duration represents agent activity;
- the clean observed scenario would produce approximately 51s PLAN and 49s EXECUTE;
- existing lifecycle semantics remain intact;
- legacy/incomplete data is handled safely;
- dashboard consumes the corrected metrics without independently redefining them;
- tests cover the new timing semantics;
- all tests pass;
- TypeScript typecheck passes;
- no unrelated files are modified;
- nothing is staged or committed by the agent.
