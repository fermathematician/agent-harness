import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const AUDIT_DIR = ".pi/audit";
const AUDIT_FILE = path.join(AUDIT_DIR, "tool-calls.jsonl");

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

export function appendAudit(entry: Record<string, unknown>) {
  ensureAuditDir();

  const auditEntry = {
    ...entry,
    sessionBaseCommit: readSessionBaseCommit(),
  };

  fs.appendFileSync(AUDIT_FILE, JSON.stringify(auditEntry) + "\n", "utf8");
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
export function recordGuardrailBlock(decision: GuardrailDecision) {
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
