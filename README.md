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
      stamping each event with `sessionBaseCommit`, `runId`, and
      `schemaVersion`;
    - `safety.ts` — blocks Git write operations, protects the
      `.pi/extensions` directory itself, and enforces bash command guardrails
      (allowlist/denylist);
    - `plan-mode.ts` — implements the `/plan` and `/execute` commands and
      manages read-only plan mode plus plan/execute workflow state.
  - `skills/` — placeholder for custom skills.
  - `lib/` — shared harness modules:
    - `audit.ts` — the shared audit writer: appends entries to
      `.pi/audit/tool-calls.jsonl`, stamping each entry with
      `sessionBaseCommit`, `runId`, and `schemaVersion`; provides
      `recordGuardrailBlock` so guardrail extensions record their block
      decisions as audit facts; and manages run state via
      `readActiveRunState`/`writeActiveRunState` and lifecycle events.
  - `audit/run.json` — runtime state for the current Run (mutable, overwritten
    each Run).
- `evals/` — run evaluation of agent behavior:
  - `run-eval.ts` — reads the audit log (`.pi/audit/tool-calls.jsonl`),
    groups V1 events by `runId` (legacy pre-V1 events by `sessionBaseCommit`),
    derives phase boundaries from lifecycle events,
    and computes per-run metrics: read-before-edit ratio, test and typecheck
    status (not booleans), tool error counts, files read/changed, bash
    invocations, guardrail block metrics, phase-specific metrics, and
    consecutive max errors.
  - `results/run-evals.jsonl` — generated output: one JSON object per
    evaluated Run, with `schemaVersion` and `evaluatorVersion` for compatibility.
- `src/models.ts` — TypeScript definitions for the data model:
  `AuditEntry`, `RunEval`, version constants.
- `tests/`, `scripts/`, `docs/` — test suite and other utilities.

## Data model and lifecycle

### Run lifecycle

A **Run** represents one model attempting one task, from planning through
execution. A Run normally starts with `/plan`, but direct `/execute` can also
start a new Run when there is no active Run:

```
/plan <Task X>              → new Run (run_start + phase_change("plan"))
├── PLAN phase              → read-only tool calls
├── /execute <Task X>       → phase_change("execute"); same runId
└── EXECUTE phase           → read/write tool calls
    └── agent_settled       → run_complete

/execute <Task Y> with no active Run
    → new Run (run_start + phase_change("execute"))
```

A Run is **abandoned** when a new Run starts before completion (a newer
`run_start` event occurs before this Run's `run_complete`).
A Run is **active** when it has started but not yet completed or abandoned.

### Run identity

Each Run has a unique `runId` (UUID). A Run normally starts with `/plan`,
which generates a new `runId`. `/execute` preserves the active Run's `runId`.
Direct `/execute` creates a new Run and `runId` when there is no active Run
(or after the active Run completed). A new `/plan` also starts a new Run.

`sessionBaseCommit` (Git HEAD at event time) is metadata, not identity.
Multiple Runs from the same base commit are independently identifiable.

### Audit log (raw telemetry)

`.pi/audit/tool-calls.jsonl` contains one JSON object per event. Every entry
is stamped with:

- `runId` — the Run identity (null when no active Run is recorded, which
  includes legacy pre-V1 entries)
- `schemaVersion` — always `"1"` for V1+ entries (null for legacy)
- `sessionBaseCommit` — Git HEAD at event time

Event types:
- `tool_call` — every tool invocation (bash, read, write, edit, grep, etc.)
- `tool_execution_end` — result of each tool execution (isError, result)
- `guardrail_block` — each blocked action (guardrail, category, reason)
- `run_start` — Run beginning (taskDescription)
- `phase_change` — phase transition (phase: "plan" | "execute")
- `run_complete` — Run completion

### Run evaluation output (derived metrics)

`evals/results/run-evals.jsonl` contains one JSON object per Run with:

- **Metadata**: `schemaVersion`, `evaluatorVersion`, `runId`, `baseCommit`,
  `taskDescription`, `model`, `status`
- **Timing**: `runStart`, `runEnd`, `runDurationMs`, `planPhaseDurationMs`,
  `executePhaseDurationMs`
- **Phase coverage**: `hasPlanPhase`, `hasExecutePhase`
- **Per-run facts** (NOT rates): `testStatus` ("not_run" | "passed" | "failed"),
  `typecheckStatus`, `gitStatusChecked`, `diffReviewed`, `readBeforeEdit`
- **Counts**: `totalToolCalls`, `filesRead`, `filesChanged`, `bashCalls`,
  `toolErrors`, `toolCallDistribution`, guardrail block counts
- **Phase-specific**: `planPhaseToolCalls`, `executePhaseToolCalls`, etc.

**Per-run facts vs. cross-run rates**: Individual Runs contain facts
(`testStatus: "passed"`), not rates. Rates like `testPassRate` are computed
by the dashboard layer across a set of Runs.

### Dashboard

The local dashboard visualizes evaluated Runs using the Task 004 dashboard
backend (`src/dashboard.ts`); it does not recalculate metric semantics in the
browser.

Pipeline:

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
src/dashboard.ts
        │
        ▼
src/dashboard-ui.ts
        │
        ▼
Browser dashboard
```

Generate evaluated Runs from the audit log:

```bash
node evals/run-eval.ts
```

Then start the dashboard:

```bash
npm run dashboard
```

Open `http://127.0.0.1:3000`. The dashboard reads
`evals/results/run-evals.jsonl` on each request, so newly generated RunEval
data appears after a refresh without restarting the server.

### Versioning

- **`schemaVersion`**: version of the raw telemetry schema. It identifies
  which telemetry schema is associated with an evaluation output. Incremented
  when `AuditEntry` structure changes.
- **`evaluatorVersion`**: version of the metric definitions. It identifies
  which metric semantics produced an evaluation. Incremented when `RunEval`
  metric semantics change. Protects against silently comparing incompatible
  metrics over time.

### Safety model

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
   carries `sessionBaseCommit` (Git HEAD at event time), `runId` (Run identity),
   and `schemaVersion`. Guardrail blocks are recorded as explicit
   `guardrail_block` entries with `guardrail`, `category` (`git_write`,
   `protected_path`, `plan_mode_tool`, `plan_mode_command`), and `reason`.
   Lifecycle events (`run_start`, `phase_change`, `run_complete`) provide
   explicit Run boundary markers.
