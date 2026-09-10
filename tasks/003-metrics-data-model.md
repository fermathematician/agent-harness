Task 003 — Define the metrics and data model for the harness.

Goal:
Create a stable data contract between the existing audit/evaluation pipeline and the future dashboard.

The dashboard should consume a well-defined model rather than deriving domain concepts directly from raw audit logs.

Inspect the current repository, especially:

- audit events and JSONL structure
- evaluation pipeline and results
- sessionBaseCommit
- guardrail events and categories
- existing tests and documentation
- Git metadata currently available

Design the minimum useful data model for representing:

- sessions/runs
- tasks
- models
- tool calls
- guardrail blocks
- evaluations
- Git/code-change metadata
- derived metrics

Consider which fields already exist, which must be derived, and which genuinely need to be captured in future runs.

Define useful V1 metrics for:

- quality
- agent behavior
- efficiency
- engineering/code changes
- comparisons between models, tasks, and runs

Avoid building the dashboard itself.
Avoid adding metrics merely because they are easy to collect.
Prefer metrics that help evaluate coding-agent quality, behavior, cost/efficiency, and reliability.

Identify:

1. the proposed entities/schema;
2. raw vs derived fields;
3. aggregation rules;
4. missing telemetry, if any;
5. what should be persisted;
6. what the future dashboard should query;
7. the minimum implementation required before dashboard development can begin.

Do not modify any files.
Keep the plan focused on the data contract and metrics layer.
