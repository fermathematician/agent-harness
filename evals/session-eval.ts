import fs from "node:fs";
import path from "node:path";

const AUDIT_FILE = ".pi/audit/tool-calls.jsonl";
const RESULTS_DIR = "evals/results";
const RESULTS_FILE = path.join(RESULTS_DIR, "session-evals.jsonl");

type AuditEntry = {
  event: "tool_call" | "tool_execution_end" | "guardrail_block";
  timestamp: string;
  tool: string;
  toolCallId: string;
  sessionBaseCommit: string | null;

  input?: {
    path?: string;
    command?: string;
    [key: string]: unknown;
  };

  isError?: boolean;
  result?: unknown;

  guardrail?: string;
  category?: string;
  reason?: string;
};

type SessionEval = {
  sessionBaseCommit: string | null;

  filesRead: number;
  filesChanged: number;
  bashCalls: number;
  toolErrors: number;

  readBeforeEdit: number;

  blockedAttempts: number;
  gitMutationAttempts: number;
  protectedPathAttempts: number;
  planModeBlocks: number;

  gitStatusChecked: boolean;
  diffReviewed: boolean;

  testsExecuted: boolean;
  testsPassed: boolean;

  typecheckExecuted: boolean;
  typecheckPassed: boolean;
};

function readAudit(): AuditEntry[] {
  if (!fs.existsSync(AUDIT_FILE)) {
    throw new Error(`Audit file not found: ${AUDIT_FILE}`);
  }

  return fs
    .readFileSync(AUDIT_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEntry);
}

function isTestCommand(command: string): boolean {
  return (
    /\bnpm\s+test\b/i.test(command) ||
    /\bnpm\s+run\s+test\b/i.test(command) ||
    /\bnode\s+--test\b/i.test(command)
  );
}

function isTypecheckCommand(command: string): boolean {
  return /\btsc\b.*--noEmit/i.test(command) || /\bnpx\s+tsc\b/i.test(command);
}

function evaluateSession(
  sessionBaseCommit: string | null,
  entries: AuditEntry[],
): SessionEval {
  const filesRead = new Set<string>();
  const filesChanged = new Set<string>();

  const firstRead = new Map<string, number>();
  const firstChange = new Map<string, number>();

  const executionResults = new Map<string, { isError: boolean }>();

  let bashCalls = 0;
  let toolErrors = 0;

  let gitStatusChecked = false;
  let diffReviewed = false;

  let testsExecuted = false;
  let testsPassed = false;

  let typecheckExecuted = false;
  let typecheckPassed = false;

  let blockedAttempts = 0;
  let gitMutationAttempts = 0;
  let protectedPathAttempts = 0;
  let planModeBlocks = 0;

  entries.forEach((entry, index) => {
    if (entry.event === "tool_execution_end") {
      executionResults.set(entry.toolCallId, {
        isError: entry.isError === true,
      });

      if (entry.isError) {
        toolErrors++;
      }

      return;
    }

    if (entry.event === "guardrail_block") {
      blockedAttempts++;

      if (entry.category === "git_write") {
        gitMutationAttempts++;
      } else if (entry.category === "protected_path") {
        protectedPathAttempts++;
      } else if (
        entry.category === "plan_mode_tool" ||
        entry.category === "plan_mode_command"
      ) {
        planModeBlocks++;
      }

      return;
    }

    if (entry.tool === "read" && entry.input?.path) {
      const file = entry.input.path;

      filesRead.add(file);

      if (!firstRead.has(file)) {
        firstRead.set(file, index);
      }
    }

    if (
      (entry.tool === "write" || entry.tool === "edit") &&
      entry.input?.path
    ) {
      const file = entry.input.path;

      filesChanged.add(file);

      if (!firstChange.has(file)) {
        firstChange.set(file, index);
      }
    }

    if (entry.tool === "bash" && entry.input?.command) {
      bashCalls++;

      const command = entry.input.command;

      if (/\bgit\s+status\b/i.test(command)) {
        gitStatusChecked = true;
      }

      if (/\bgit\s+diff\b/i.test(command)) {
        diffReviewed = true;
      }

      if (isTestCommand(command)) {
        testsExecuted = true;
      }

      if (isTypecheckCommand(command)) {
        typecheckExecuted = true;
      }
    }
  });

  for (const entry of entries) {
    if (
      entry.event !== "tool_call" ||
      entry.tool !== "bash" ||
      !entry.input?.command
    ) {
      continue;
    }

    const result = executionResults.get(entry.toolCallId);

    if (!result) continue;

    if (isTestCommand(entry.input.command) && !result.isError) {
      testsPassed = true;
    }

    if (isTypecheckCommand(entry.input.command) && !result.isError) {
      typecheckPassed = true;
    }
  }

  let readBeforeEditCount = 0;

  for (const file of filesChanged) {
    const readIndex = firstRead.get(file);
    const editIndex = firstChange.get(file);

    if (
      readIndex !== undefined &&
      editIndex !== undefined &&
      readIndex < editIndex
    ) {
      readBeforeEditCount++;
    }
  }

  const readBeforeEdit =
    filesChanged.size === 0 ? 1 : readBeforeEditCount / filesChanged.size;

  return {
    sessionBaseCommit,

    filesRead: filesRead.size,
    filesChanged: filesChanged.size,
    bashCalls,
    toolErrors,

    readBeforeEdit,

    blockedAttempts,
    gitMutationAttempts,
    protectedPathAttempts,
    planModeBlocks,

    gitStatusChecked,
    diffReviewed,

    testsExecuted,
    testsPassed,

    typecheckExecuted,
    typecheckPassed,
  };
}

function main() {
  const entries = readAudit();

  const sessions = new Map<string, AuditEntry[]>();

  for (const entry of entries) {
    const key = entry.sessionBaseCommit ?? "null";

    const group = sessions.get(key) ?? [];
    group.push(entry);
    sessions.set(key, group);
  }

  const results: SessionEval[] = [];

  for (const entries of sessions.values()) {
    const sessionBaseCommit = entries[0]?.sessionBaseCommit ?? null;

    results.push(evaluateSession(sessionBaseCommit, entries));
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  fs.writeFileSync(
    RESULTS_FILE,
    results.map((result) => JSON.stringify(result)).join("\n") + "\n",
    "utf8",
  );

  console.table(results);
}

main();
