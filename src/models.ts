/**
 * Data model for the agent harness.
 *
 * Defines the contracts between the audit log (raw telemetry) and the
 * evaluation output (derived metrics). This file is the single source of
 * truth for type definitions and version constants.
 */

// ──────────────────────────────────────────────
// Version constants
// ──────────────────────────────────────────────

/**
 * Version of the raw telemetry schema written to the audit log.
 * Increment when AuditEntry structure changes.
 */
export const SCHEMA_VERSION = "1";

/**
 * Version of the evaluator/metric definitions.
 * Increment when RunEval metric semantics change.
 */
export const EVALUATOR_VERSION = "1";

// ──────────────────────────────────────────────
// Run lifecycle states
// ──────────────────────────────────────────────

/**
 * Lifecycle event types emitted to the audit log.
 */
export type LifecycleEventType = "run_start" | "phase_change" | "run_complete";

/**
 * Phase of a Run. A Run spans PLAN and EXECUTE phases.
 */
export type RunPhase = "plan" | "execute";

/**
 * Status of a Run as reported in RunEval.
 */
export type RunStatus = "active" | "completed" | "abandoned";

// ──────────────────────────────────────────────
// Audit log types (raw telemetry)
// ──────────────────────────────────────────────

/**
 * All event types in the audit log.
 */
export type AuditEventType =
  | "tool_call"
  | "tool_execution_end"
  | "guardrail_block"
  | "run_start"
  | "phase_change"
  | "run_complete";

/**
 * Base audit entry with lifecycle metadata stamped at write time.
 *
 * - `runId`: generated when a Run starts. Null for legacy entries (pre-V1).
 * - `schemaVersion`: always "1" for V1+ entries. Null for legacy entries.
 * - `sessionBaseCommit`: Git HEAD at event time (pre-existing field).
 */
export interface AuditEntry {
  event: AuditEventType;
  timestamp: string;
  runId: string | null;
  schemaVersion: string | null;
  tool?: string;
  toolCallId?: string;
  sessionBaseCommit: string | null;

  // Tool call fields
  input?: Record<string, unknown>;
  isError?: boolean;
  result?: unknown;

  // Guardrail block fields
  guardrail?: string;
  category?: string;
  reason?: string;

  // Lifecycle event fields
  taskDescription?: string; // present on run_start
  phase?: RunPhase; // present on phase_change
}

// ──────────────────────────────────────────────
// Run evaluation output types
// ──────────────────────────────────────────────

/**
 * Per-run evaluation result. One JSON object per Run, written to
 * `evals/results/run-evals.jsonl`.
 *
 * Fields are per-run facts (not rates). Rates are computed at the
 * dashboard layer across a set of RunEval objects.
 */
export interface RunEval {
  /** Telemetry schema consumed by this evaluator (must equal SCHEMA_VERSION). */
  schemaVersion: string;

  /** Version of the metric definitions used to produce this output. */
  evaluatorVersion: string;

  /** Run identity. Null for legacy Runs evaluated from pre-V1 audit data. */
  runId: string | null;

  /** Git HEAD at the time the Run started (from first audit event). */
  baseCommit: string | null;

  /** Task description from the run_start event. */
  taskDescription: string;

  /** Model identifier. Null in V1 until the harness captures it. */
  model: string | null;

  /**
   * Run lifecycle status:
   * - "active": run started but not yet completed or abandoned.
   * - "completed": run has a run_complete event.
   * - "abandoned": run has a newer run_start (no run_complete before new Run).
   */
  status: RunStatus;

  // ── Timing (derived from lifecycle events and timestamps) ──

  /** ISO timestamp of the run_start event. */
  runStart: string;

  /** ISO timestamp of the run_complete event, or latest event if abandoned. */
  runEnd: string;

  /** Duration in milliseconds from runStart to runEnd. */
  runDurationMs: number;

  /** Duration in ms from plan phase start to execute phase start. Null if no execute phase. */
  planPhaseDurationMs: number | null;

  /** Duration in ms from execute phase start to run_complete. Null if no execute phase or not completed. */
  executePhaseDurationMs: number | null;

  // ── Phase coverage ──

  /** True if a phase_change to "plan" exists in this Run's audit events. */
  hasPlanPhase: boolean;

  /** True if a phase_change to "execute" exists in this Run's audit events. */
  hasExecutePhase: boolean;

  // ── Per-run facts (NOT rates) ──

  /** Test execution status. */
  testStatus: "not_run" | "passed" | "failed";

  /** Typecheck execution status. */
  typecheckStatus: "not_run" | "passed" | "failed";

  /** True if the agent ran `git status` during this Run. */
  gitStatusChecked: boolean;

  /** True if the agent reviewed `git diff` during this Run. */
  diffReviewed: boolean;

  /** Ratio of changed files that were read before first edit (0-1). */
  readBeforeEdit: number;

  // ── Per-run counts ──

  /** Total number of tool_call events. */
  totalToolCalls: number;

  /** Number of unique files read. */
  filesRead: number;

  /** Number of unique files written or edited. */
  filesChanged: number;

  /** Number of bash invocations. */
  bashCalls: number;

  /** Number of tool executions that resulted in errors. */
  toolErrors: number;

  /** Distribution of tool call counts by tool name. */
  toolCallDistribution: Record<string, number>;

  // ── Guardrail block counts (per-run) ──

  /** Total guardrail_block events. */
  blockedAttempts: number;

  /** Guardrail blocks with category "git_write". */
  gitMutationAttempts: number;

  /** Guardrail blocks with category "protected_path". */
  protectedPathAttempts: number;

  /** Guardrail blocks with category "plan_mode_tool" or "plan_mode_command". */
  planModeBlocks: number;

  // ── Phase-specific metrics ──

  /** Tool calls during PLAN phase only. Null if no plan phase. */
  planPhaseToolCalls: number | null;

  /** Tool errors during PLAN phase only. Null if no plan phase. */
  planPhaseToolErrors: number | null;

  /** Tool calls during EXECUTE phase only. Null if no execute phase. */
  executePhaseToolCalls: number | null;

  /** Tool errors during EXECUTE phase only. Null if no execute phase. */
  executePhaseToolErrors: number | null;

  // ── Additional derived metrics ──

  /** Maximum streak of consecutive tool errors. */
  consecutiveMaxErrors: number;
}
