# Task 004 — Dashboard Backend

## Goal

Build the backend/data layer that transforms `RunEval` records into aggregated,
queryable dashboard data.

This task must not implement the dashboard UI.

## Context

Task 003 established the per-Run evaluation contract:

- raw telemetry: `.pi/audit/tool-calls.jsonl`
- evaluator: `evals/run-eval.ts`
- evaluated Runs: `evals/results/run-evals.jsonl`
- canonical data model: `src/models.ts`

`RunEval` represents facts about one Run.

Task 004 must build the next layer:

RunEval records
→ filtering
→ aggregation
→ comparison
→ dashboard-ready data

The dashboard must consume this layer instead of reimplementing metric semantics.

## Requirements

### 1. Load evaluated Runs

Implement a data layer that reads:

`evals/results/run-evals.jsonl`

and parses the records using the existing `RunEval` contract.

Do not duplicate the `RunEval` type.

### 2. Run queries

Provide functions for querying Runs by relevant dimensions available in V1,
including where applicable:

- runId
- status
- taskDescription
- baseCommit
- model
- time range

Filtering must not mutate the source records.

### 3. Aggregate metrics

Provide aggregate metrics across a selected set of Runs.

At minimum:

- total Runs
- completed Runs
- active Runs
- abandoned Runs
- test pass rate
- typecheck pass rate
- average run duration
- average PLAN duration
- average EXECUTE duration
- average tool calls per Run
- average tool errors per Run
- total blocked attempts
- average blocked attempts per Run
- average read-before-edit ratio
- average files read
- average files changed
- average bash calls
- average consecutive max errors

Rates must be derived from per-Run facts.

Do not store cross-Run rates inside `RunEval`.

### 4. Tool usage aggregation

Aggregate `toolCallDistribution` across Runs.

The backend must be able to return:

- total calls per tool
- average calls per tool per Run
- relative tool distribution

### 5. Guardrail aggregation

Aggregate:

- blockedAttempts
- gitMutationAttempts
- protectedPathAttempts
- planModeBlocks

Expose both totals and per-Run averages where meaningful.

### 6. Phase aggregation

Aggregate PLAN and EXECUTE metrics separately where data exists:

- tool calls
- tool errors
- average phase duration

Runs without a phase must not be treated as having zero-duration phases.

Use only Runs that actually contain the relevant phase when computing
phase-duration averages.

### 7. Comparison layer

Provide a generic way to compare groups of Runs using dimensions already
present in `RunEval`.

The V1 comparison layer should support grouping by:

- model
- taskDescription
- baseCommit

Do not invent model data when `model` is null.

The comparison output should expose the same core aggregate metrics for each
group.

### 8. Legacy handling

`runId: null` records may exist.

The backend must handle them without crashing.

Legacy/unassociated records must be distinguishable so the future dashboard
can include or exclude them explicitly.

### 9. Empty and missing data

Aggregation must behave predictably when:

- there are zero Runs
- no Runs contain PLAN
- no Runs contain EXECUTE
- no tests were run
- no typechecks were run
- model is null
- optional metrics are null

Do not convert missing/not-applicable data into misleading zero values.

### 10. Tests

Add tests covering:

- loading JSONL
- filtering
- empty dataset
- status counts
- pass-rate calculation
- duration averages
- PLAN/EXECUTE aggregation
- tool distribution
- guardrail aggregation
- grouping/comparison
- null model
- legacy `runId: null`
- missing/not-applicable values

Tests must exercise the real dashboard backend implementation rather than
duplicating aggregation algorithms inside the tests.

## Architecture constraints

- `src/models.ts` remains the canonical data contract.
- Do not modify raw audit semantics.
- Do not modify Run lifecycle semantics.
- Do not modify guardrails.
- Do not modify protected `.pi/extensions`.
- Do not add UI components.
- Do not add a database unless repository evidence shows one is necessary.
- Prefer a small deterministic data layer over a framework.
- Keep aggregation logic independent from presentation.
- Do not stage or commit files.

## Expected flow

```text
.pi/audit/tool-calls.jsonl
        │
        ▼
evals/run-eval.ts
        │
        ▼
evals/results/run-evals.jsonl
        │
        ▼
dashboard backend
   ├── load
   ├── filter
   ├── aggregate
   └── compare
        │
        ▼
dashboard-ready data
```
