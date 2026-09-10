import { SCHEMA_VERSION as SCHEMA_VERSION_FROM_MODELS, EVALUATOR_VERSION, type RunPhase } from "../../src/models.ts";

const SCHEMA_VERSION = SCHEMA_VERSION_FROM_MODELS;

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const AUDIT_DIR = ".pi/audit";
const AUDIT_FILE = path.join(AUDIT_DIR, "tool-calls.jsonl");
const RUN_STATE_FILE = path.join(AUDIT_DIR, "run.json");

export { SCHEMA_VERSION };
export type { RunPhase };

export type GuardrailName = "safety" | "plan-mode";

export type GuardrailCategory =
  | "git_write"
  | "protected_path"
  | "plan_mode_tool"
  | "plan_mode_command";

export interface GuardrailDecision {
  guardrail: GuardrailName;
  category: GuardrailCategory;
  reason: string;
  tool: string;
  toolCallId: string;
  input: Record<string, unknown>;
}

export interface RunState {
  runId: string;
  task: string;
  currentPhase: RunPhase;
  startedAt: string;
  completedAt: string | null;
}

function ensureAuditDir() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

function readSessionBaseCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Reads the current run state from disk.
 * Returns null if the file does not exist.
 */
export function readActiveRunState(): RunState | null {
  try {
    if (!fs.existsSync(RUN_STATE_FILE)) {
      return null;
    }
    const data = fs.readFileSync(RUN_STATE_FILE, "utf8");
    return JSON.parse(data) as RunState;
  } catch {
    return null;
  }
}

/**
 * Writes run state to disk (overwrites existing state).
 */
export function writeActiveRunState(state: RunState): void {
  ensureAuditDir();
  fs.writeFileSync(RUN_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Appends an entry to the audit log.
 *
 * Stamps every entry with:
 * - runId: from current run state (null if no active run)
 * - schemaVersion: always SCHEMA_VERSION for V1+
 * - sessionBaseCommit: Git HEAD at write time
 *
 * Note: If the incoming entry already has a runId, it is preserved.
 * This is important for lifecycle events where runId is passed explicitly.
 */
export function appendAudit(entry: Record<string, unknown>): void {
  ensureAuditDir();

  const runState = readActiveRunState();

  // Preserve explicit runId from the entry (e.g., from lifecycle events)
  const runId = (entry as Record<string, unknown>).runId ?? runState?.runId ?? null;

  const auditEntry = {
    ...entry,
    runId,
    schemaVersion: SCHEMA_VERSION,
    sessionBaseCommit: readSessionBaseCommit(),
  };

  fs.appendFileSync(AUDIT_FILE, JSON.stringify(auditEntry) + "\n", "utf8");
}

/**
 * Appends a lifecycle event to the audit log.
 * The explicit runId is preserved on the event (not overridden by run.json).
 */
export function appendLifecycleEvent(
  eventType: "run_start" | "phase_change" | "run_complete",
  runId: string,
  fields?: Record<string, unknown>,
): void {
  const base: Record<string, unknown> = {
    event: eventType,
    timestamp: new Date().toISOString(),
    runId, // ← explicitly set runId so appendAudit preserves it
  };

  if (eventType === "run_start" && fields?.taskDescription) {
    base.taskDescription = fields.taskDescription;
  }

  if (eventType === "phase_change" && fields?.phase) {
    base.phase = fields.phase;
  }

  appendAudit(base);
}

/**
 * Records a guardrail block decision as an audit fact.
 *
 * Every guardrail extension MUST record each block it performs through this
 * function so that blocked attempts remain measurable in the audit log.
 * The recorded entry is a fact, not an interpretation: it names the
 * guardrail that decided, a stable machine-readable category, the
 * human-facing reason shown to the user, and the session base commit at
 * decision time.
 */
export function recordGuardrailBlock(decision: GuardrailDecision): void {
  appendAudit({
    event: "guardrail_block",
    timestamp: new Date().toISOString(),
    tool: decision.tool,
    toolCallId: decision.toolCallId,
    input: decision.input,
    guardrail: decision.guardrail,
    category: decision.category,
    reason: decision.reason,
  });
}
