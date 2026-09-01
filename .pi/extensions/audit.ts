import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const AUDIT_DIR = ".pi/audit";
const AUDIT_FILE = path.join(AUDIT_DIR, "tool-calls.jsonl");

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

function appendAudit(entry: Record<string, unknown>) {
  ensureAuditDir();

  const auditEntry = {
    ...entry,
    sessionBaseCommit: readSessionBaseCommit(),
  };

  fs.appendFileSync(AUDIT_FILE, JSON.stringify(auditEntry) + "\n", "utf8");
}

export default function audit(pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    const base = {
      event: "tool_call",
      timestamp: new Date().toISOString(),
      tool: event.toolName,
      toolCallId: event.toolCallId,
    };

    if (isToolCallEventType("bash", event)) {
      appendAudit({
        ...base,
        input: {
          command: event.input.command,
        },
      });
      return;
    }

    if (isToolCallEventType("read", event)) {
      appendAudit({
        ...base,
        input: {
          path: event.input.path,
          offset: event.input.offset,
          limit: event.input.limit,
        },
      });
      return;
    }

    if (isToolCallEventType("write", event)) {
      appendAudit({
        ...base,
        input: {
          path: event.input.path,
        },
      });
      return;
    }

    if (isToolCallEventType("edit", event)) {
      appendAudit({
        ...base,
        input: {
          path: event.input.path,
        },
      });
      return;
    }

    appendAudit({
      ...base,
      input: event.input,
    });
  });

  pi.on("tool_execution_end", async (event) => {
    appendAudit({
      event: "tool_execution_end",
      timestamp: new Date().toISOString(),
      tool: event.toolName,
      toolCallId: event.toolCallId,
      isError: event.isError,
      result: event.result,
    });
  });
}
