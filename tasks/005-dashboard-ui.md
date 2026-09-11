# Task 005 — Dashboard UI

## Goal

Build the first visual dashboard for the agent harness using the data layer
created in Task 004.

The dashboard must visualize and compare evaluated Runs without reimplementing
metric semantics in the UI.

## Context

The current pipeline is:

audit JSONL
↓
Run evaluator
↓
RunEval JSONL
↓
src/dashboard.ts
↓
Dashboard UI

Task 003 defined the Run evaluation model.

Task 004 created the dashboard backend/data layer.

Task 005 adds the presentation layer on top of that backend.

The UI must consume the existing dashboard functions instead of independently
calculating metric semantics.

## Requirements

### 1. Local dashboard

Create a local web dashboard for exploring harness Runs.

Prefer the smallest architecture that fits the existing repository.

Do not introduce a database, authentication, deployment infrastructure, or
external backend service.

The dashboard must be runnable locally from the repository.

### 2. Overview

Display at minimum:

- total Runs
- completed Runs
- active Runs
- abandoned Runs
- test pass rate
- typecheck pass rate
- average Run duration
- average PLAN duration
- average EXECUTE duration
- average tool calls per Run
- average tool errors per Run
- average read-before-edit ratio
- total blocked attempts

Null or not-applicable values must not be converted into misleading zeros.

### 3. Filters

Expose useful filters supported by Task 004:

- status
- model
- task description
- base commit
- time range
- legacy/unassociated Runs (`runId: null`)

Filtering must ultimately use `filterRuns()` from `src/dashboard.ts`.

Do not independently redefine filtering semantics in the UI.

### 4. Run table

Provide a table for inspecting individual Runs.

At minimum show:

- runId
- task description
- model
- status
- start time
- duration
- test status
- typecheck status
- tool calls
- tool errors
- files read
- files changed
- blocked attempts

Completed, active, and abandoned Runs should be visually distinguishable.

Legacy `runId: null` Runs must remain identifiable.

### 5. PLAN vs EXECUTE

Display PLAN and EXECUTE phase aggregates separately.

At minimum show:

- number of Runs containing the phase
- average duration
- total tool calls
- total tool errors

Use `aggregatePhases()`.

A Run without a phase must not be represented as a zero-duration phase.

### 6. Tool usage

Visualize data from `aggregateToolUsage()`.

At minimum show:

- tool
- total calls
- average calls per Run
- relative share

Dominant tools should be easy to identify.

### 7. Guardrails

Display guardrail activity.

At minimum show:

- blocked attempts
- Git mutation attempts
- protected path attempts
- PLAN mode blocks

Show totals and per-Run averages where provided by the backend.

Guardrail blocks represent observed agent behavior and must not automatically
be presented as application failures.

### 8. Comparisons

Allow Runs to be compared using `compareRuns()` by:

- model
- task description
- base commit

Null groups must remain null in the underlying data.

The presentation layer may display labels such as "Unknown" or "Unassociated"
for null values.

### 9. Presentation rules

Formatting belongs in the UI.

Metric semantics belong in `src/dashboard.ts`.

The UI may:

- format durations
- display ratios as percentages
- format timestamps
- convert null to a presentation label such as "N/A"

The UI must not independently calculate:

- pass-rate semantics
- phase membership
- guardrail metrics
- comparison grouping
- aggregation semantics already defined by Task 004

### 10. Empty and legacy states

The dashboard must behave correctly when:

- `run-evals.jsonl` does not exist
- dataset is empty
- filters return zero Runs
- model is null
- runId is null
- no PLAN phase exists
- no EXECUTE phase exists
- tests were not run
- typecheck was not run
- no guardrail blocks exist

These states must render meaningfully instead of crashing.

### 11. Data freshness

The dashboard should be able to reflect newly generated RunEval data without
requiring repository changes.

Prefer re-reading the RunEval data when appropriate rather than embedding a
snapshot into the UI.

### 12. Documentation

Update README.md with a concise Dashboard section explaining:

- how Run evaluations are generated
- how to start the dashboard
- where its data comes from
- the pipeline from audit → evaluator → dashboard backend → UI

### 13. Tests

Add tests appropriate to the selected UI architecture.

At minimum verify:

- dashboard data path uses the real Task 004 backend
- valid Run data can be presented
- empty dataset works
- filters affect displayed data
- null/not-applicable values are handled
- legacy `runId: null` remains identifiable
- PLAN/EXECUTE data is presented correctly
- tool usage is presented correctly
- guardrail data is presented correctly
- comparisons use backend results

Do not reimplement aggregation algorithms inside UI tests.

## Architecture constraints

- `src/models.ts` remains the canonical RunEval contract.
- `src/dashboard.ts` remains the canonical dashboard data/aggregation layer.
- Reuse Task 004 functions.
- Do not change Run lifecycle semantics.
- Do not change evaluator semantics.
- Do not change audit semantics.
- Do not modify guardrails.
- Do not modify protected `.pi/extensions`.
- Do not add a database.
- Do not add authentication.
- Do not add deployment infrastructure.
- Do not stage or commit files.

## Design direction

This is an engineering and observability dashboard, not a marketing page.

Prioritize:

- information density
- readability
- comparison between Runs
- clear metric hierarchy
- fast scanning
- useful tables and visualizations
- restrained styling

Avoid decorative UI that does not help evaluate agent behavior.

## Expected data flow

RunEval[]
│
├── filterRuns()
├── aggregateRuns()
├── aggregatePhases()
├── aggregateToolUsage()
├── aggregateGuardrails()
└── compareRuns()
│
▼
Dashboard UI
│
├── Overview
├── Runs
├── PLAN vs EXECUTE
├── Tool Usage
├── Guardrails
└── Comparisons

## Definition of Done

- Dashboard runs locally.
- Existing RunEval data can be explored visually.
- Overview metrics are displayed.
- Runs can be filtered and inspected.
- PLAN and EXECUTE are displayed separately.
- Tool usage is visualized.
- Guardrail activity is visible.
- Runs can be compared by supported dimensions.
- Empty, null, and legacy states are handled.
- UI does not duplicate Task 004 metric semantics.
- README documents how to run the dashboard.
- Tests exercise the real implementation.
- Full test suite passes.
- `npx tsc --noEmit` passes.
- Final diff contains only Task 005 changes.
- No files are staged or committed by the agent.
