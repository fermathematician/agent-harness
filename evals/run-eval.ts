import fs from "node:fs";
import path from "node:path";
import {
  SCHEMA_VERSION,
  EVALUATOR_VERSION,
  type AuditEntry,
  type RunEval,
  type RunStatus,
} from "../src/models.ts";

const AUDIT_FILE = ".pi/audit/tool-calls.jsonl";
const RESULTS_DIR = "evals/results";
const RESULTS_FILE = path.join(RESULTS_DIR, "run-evals.jsonl");

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

interface CompletedExecution {
  isError: boolean;
  index: number;
}

/**
 * Compute the final status for a command family (test or typecheck) from
 * the last completed matching invocation in this Run.
 *
 * A tool_call is only considered when it has a matching tool_execution_end
 * with the same toolCallId. The last completed invocation is the one whose
 * tool_execution_end appears last in the audit log.
 */
function lastCompletedCommandStatus(
  entries: AuditEntry[],
  executionResults: Map<string, CompletedExecution>,
  matches: (command: string) => boolean,
): "not_run" | "passed" | "failed" {
  let found = false;
  let lastIndex = -1;
  let lastIsError = false;

  for (const entry of entries) {
    if (entry.event !== "tool_call" || entry.tool !== "bash") {
      continue;
    }

    const command = entry.input?.command;
    if (typeof command !== "string" || !matches(command)) {
      continue;
    }

    const result = executionResults.get(entry.toolCallId!);
    if (!result) {
      continue;
    }

    if (!found || result.index > lastIndex) {
      found = true;
      lastIndex = result.index;
      lastIsError = result.isError;
    }
  }

  if (!found) {
    return "not_run";
  }

  return lastIsError ? "failed" : "passed";
}

interface PhaseBoundaries {
  planStartMs: number | null;
  planEndMs: number | null;       // when PLAN ends (first phase_change("execute"))
  executeStartMs: number | null;  // when EXECUTE starts (same as planEndMs)
  executeEndMs: number | null;    // when EXECUTE ends (run_complete or latest event)
}

/**
 * Find phase boundaries from phase_change events and run_complete.
 *
 * V1 lifecycle mapping:
 * - phase_change("plan") = PLAN start
 * - phase_change("execute") = PLAN end AND EXECUTE start
 * - run_complete = EXECUTE end
 *
 * If EXECUTE has not started yet, planEndMs remains null and tool calls
 * after phase_change("plan") still belong to PLAN.
 */
function findPhaseBoundaries(entries: AuditEntry[]): PhaseBoundaries {
  const phaseChanges = entries
    .filter((e) => e.event === "phase_change" && e.phase !== undefined)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (phaseChanges.length === 0) {
    return { planStartMs: null, planEndMs: null, executeStartMs: null, executeEndMs: null };
  }

  let planStartMs: number | null = null;
  let planEndMs: number | null = null;
  let executeStartMs: number | null = null;
  let executeEndMs: number | null = null;

  // First pass: find phase_change boundaries
  for (const phase of phaseChanges) {
    const ts = new Date(phase.timestamp).getTime();
    if (phase.phase === "plan") {
      if (planStartMs === null) {
        planStartMs = ts;
      }
    }
    if (phase.phase === "execute") {
      if (executeStartMs === null) {
        executeStartMs = ts;
        // PLAN ends where EXECUTE begins
        planEndMs = ts;
      }
    }
  }

  // Second pass: find run_complete timestamp for execute end
  for (const entry of entries) {
    if (entry.event === "run_complete") {
      executeEndMs = new Date(entry.timestamp).getTime();
      break;
    }
  }

  return { planStartMs, planEndMs, executeStartMs, executeEndMs };
}

function isPhaseEvent(
  entry: AuditEntry,
  boundaries: PhaseBoundaries,
  phase: "plan" | "execute",
): boolean {
  const entryTime = new Date(entry.timestamp).getTime();

  if (phase === "plan") {
    if (boundaries.planStartMs === null) return false;
    // Events from planStartMs up to (but not including) phase_change("execute")
    if (boundaries.planEndMs !== null && entryTime >= boundaries.planEndMs)
      return false;
    return entryTime >= boundaries.planStartMs;
  }

  if (phase === "execute") {
    if (boundaries.executeStartMs === null) return false;
    return entryTime >= boundaries.executeStartMs;
  }

  return false;
}

/**
 * Events that represent actual agent work. The timestamp of the latest such
 * event within a phase marks when the agent stopped working in that phase.
 */
const ACTIVITY_EVENTS = new Set([
  "tool_call",
  "tool_execution_end",
  "guardrail_block",
]);

/**
 * Find the timestamp of the last agent-activity event in [fromMs, toMs).
 * `toMs === null` means there is no upper bound (the phase is still active).
 * Returns null when there is no activity in the window.
 */
function lastActivityMs(
  entries: AuditEntry[],
  fromMs: number,
  toMs: number | null,
): number | null {
  let last: number | null = null;

  for (const entry of entries) {
    if (!ACTIVITY_EVENTS.has(entry.event)) {
      continue;
    }

    const ts = new Date(entry.timestamp).getTime();
    if (ts < fromMs) {
      continue;
    }
    if (toMs !== null && ts >= toMs) {
      continue;
    }

    if (last === null || ts > last) {
      last = ts;
    }
  }

  return last;
}

/**
 * Determine the status of a Run.
 *
 * A Run is:
 * - "completed" if it has a run_complete event
 * - "abandoned" if a NEWER run has a run_start event (detected by comparing
 *   run_start timestamps across all Runs)
 * - "active" otherwise
 *
 * Abandonment detection requires cross-Run information, so the caller must
 * pass `otherRunStartsAfterThis: number[]` — timestamps of run_start events
 * from OTHER runs that occur after this run's run_start.
 */
function determineStatus(
  hasRunComplete: boolean,
  runStartMs: number,
  otherRunStartsAfterThis: number[],
): RunStatus {
  if (hasRunComplete) {
    return "completed";
  }
  // A Run is abandoned if any other Run started after this one
  const anyLaterRunStarted = otherRunStartsAfterThis.some(
    (otherStart) => otherStart > runStartMs,
  );
  if (anyLaterRunStarted) {
    return "abandoned";
  }
  return "active";
}

function evaluateRun(
  runId: string | null,
  baseCommit: string | null,
  taskDescription: string,
  entries: AuditEntry[],
  otherRunStartsAfterThis: number[] = [],
): RunEval {
  const filesRead = new Set<string>();
  const filesChanged = new Set<string>();
  const firstRead = new Map<string, number>();
  const firstChange = new Map<string, number>();
  const executionResults = new Map<string, CompletedExecution>();

  let bashCalls = 0;
  let toolErrors = 0;
  let totalToolCalls = 0;
  const toolCallDistribution: Record<string, number> = {};

  let gitStatusChecked = false;
  let diffReviewed = false;

  let blockedAttempts = 0;
  let gitMutationAttempts = 0;
  let protectedPathAttempts = 0;
  let planModeBlocks = 0;

  // Phase tracking
  const phaseBoundaries = findPhaseBoundaries(entries);
  let hasPlanPhase = false;
  let hasExecutePhase = false;
  let planPhaseToolCalls = 0;
  let planPhaseToolErrors = 0;
  let executePhaseToolCalls = 0;
  let executePhaseToolErrors = 0;

  // Lifecycle tracking
  let hasRunStart = false;
  let hasRunComplete = false;
  let runStartMs: number = 0;
  let runCompleteMs: number | null = null;

  entries.forEach((entry, index) => {
    // Lifecycle events
    if (entry.event === "run_start") {
      if (!hasRunStart) {
        runStartMs = new Date(entry.timestamp).getTime();
      }
      hasRunStart = true;
      return;
    }

    if (entry.event === "run_complete") {
      if (runCompleteMs === null) {
        runCompleteMs = new Date(entry.timestamp).getTime();
      }
      hasRunComplete = true;
      return;
    }

    if (entry.event === "phase_change") {
      if (entry.phase === "plan") {
        hasPlanPhase = true;
      } else if (entry.phase === "execute") {
        hasExecutePhase = true;
      }
      return;
    }

    // Tool execution end
    if (entry.event === "tool_execution_end") {
      executionResults.set(entry.toolCallId!, {
        isError: entry.isError === true,
        index,
      });

      if (entry.isError) {
        toolErrors++;
        if (
          hasPlanPhase &&
          isPhaseEvent(entry, phaseBoundaries, "plan")
        ) {
          planPhaseToolErrors++;
        }
        if (
          hasExecutePhase &&
          isPhaseEvent(entry, phaseBoundaries, "execute")
        ) {
          executePhaseToolErrors++;
        }
      }

      return;
    }

    // Guardrail blocks
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

    // Tool calls
    if (entry.event === "tool_call") {
      totalToolCalls++;
      const tool = entry.tool!;
      toolCallDistribution[tool] = (toolCallDistribution[tool] ?? 0) + 1;

      // Phase-specific counts
      if (hasPlanPhase && isPhaseEvent(entry, phaseBoundaries, "plan")) {
        planPhaseToolCalls++;
      }
      if (
        hasExecutePhase &&
        isPhaseEvent(entry, phaseBoundaries, "execute")
      ) {
        executePhaseToolCalls++;
      }

      // Read tracking
      const inputPath = entry.input?.path;
      if (tool === "read" && typeof inputPath === "string" && inputPath) {
        filesRead.add(inputPath);
        if (!firstRead.has(inputPath)) {
          firstRead.set(inputPath, index);
        }
      }

      // Write/edit tracking
      if (
        (tool === "write" || tool === "edit") &&
        typeof inputPath === "string" &&
        inputPath
      ) {
        filesChanged.add(inputPath);
        if (!firstChange.has(inputPath)) {
          firstChange.set(inputPath, index);
        }
      }

      // Bash tracking
      const inputCommand = entry.input?.command;
      if (tool === "bash" && inputCommand) {
        bashCalls++;
        if (typeof inputCommand === "string") {
          if (/\bgit\s+status\b/i.test(inputCommand)) {
            gitStatusChecked = true;
          }
          if (/\bgit\s+diff\b/i.test(inputCommand)) {
            diffReviewed = true;
          }
        }
      }
    }
  });

  const testStatus = lastCompletedCommandStatus(
    entries,
    executionResults,
    isTestCommand,
  );
  const typecheckStatus = lastCompletedCommandStatus(
    entries,
    executionResults,
    isTypecheckCommand,
  );

  // Read-before-edit ratio
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

  // Consecutive max errors: only consider tool_execution_end events.
  // Non-error tool_execution_end resets the streak.
  // Other event types (tool_call, guardrail_block, etc.) do NOT reset.
  let consecutiveMaxErrors = 0;
  let currentConsecutiveErrors = 0;
  for (const entry of entries) {
    if (entry.event === "tool_execution_end") {
      if (entry.isError) {
        currentConsecutiveErrors++;
        consecutiveMaxErrors = Math.max(
          consecutiveMaxErrors,
          currentConsecutiveErrors,
        );
      } else {
        currentConsecutiveErrors = 0;
      }
    }
  }

  // Timing
  const allTimestamps = entries.map((e) => new Date(e.timestamp).getTime());
  const latestTimestamp =
    allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0;

  let timingStartMs: number;
  let timingEndMs: number;

  if (hasRunStart) {
    timingStartMs = runStartMs;
    timingEndMs =
      hasRunComplete && runCompleteMs !== null
        ? runCompleteMs
        : latestTimestamp;
  } else {
    timingStartMs = allTimestamps.length > 0 ? Math.min(...allTimestamps) : 0;
    timingEndMs = latestTimestamp;
  }

  const runStart = timingStartMs;
  const runEnd = timingEndMs;
  const runDurationMs = runEnd - runStart;

  // Phase durations measure agent activity, not lifecycle wall-clock spans.
  //
  // PLAN ends at the last activity event before EXECUTE starts, so human idle
  // time between the end of PLAN work and `/execute` is excluded.
  //
  // EXECUTE ends at run_complete (emitted on agent_settled), which already
  // marks the true end of agent work, so it is unchanged.
  let planPhaseDurationMs: number | null = null;
  let executePhaseDurationMs: number | null = null;

  if (phaseBoundaries.planStartMs !== null) {
    const planLastActivity = lastActivityMs(
      entries,
      phaseBoundaries.planStartMs,
      phaseBoundaries.executeStartMs,
    );

    if (planLastActivity !== null) {
      planPhaseDurationMs = planLastActivity - phaseBoundaries.planStartMs;
    }
  }

  if (
    phaseBoundaries.executeStartMs !== null &&
    phaseBoundaries.executeEndMs !== null
  ) {
    executePhaseDurationMs =
      phaseBoundaries.executeEndMs - phaseBoundaries.executeStartMs;
  }

  // Status determination
  const status = determineStatus(hasRunComplete, runStartMs, otherRunStartsAfterThis);

  return {
    schemaVersion: SCHEMA_VERSION,
    evaluatorVersion: EVALUATOR_VERSION,
    runId,
    baseCommit,
    taskDescription,
    model: null, // V1: model not yet captured
    status,
    runStart: new Date(runStart).toISOString(),
    runEnd: new Date(runEnd).toISOString(),
    runDurationMs,
    planPhaseDurationMs,
    executePhaseDurationMs,
    hasPlanPhase,
    hasExecutePhase,
    testStatus,
    typecheckStatus,
    gitStatusChecked,
    diffReviewed,
    readBeforeEdit,
    totalToolCalls,
    filesRead: filesRead.size,
    filesChanged: filesChanged.size,
    bashCalls,
    toolErrors,
    toolCallDistribution,
    blockedAttempts,
    gitMutationAttempts,
    protectedPathAttempts,
    planModeBlocks,
    planPhaseToolCalls: hasPlanPhase ? planPhaseToolCalls : null,
    planPhaseToolErrors: hasPlanPhase ? planPhaseToolErrors : null,
    executePhaseToolCalls: hasExecutePhase ? executePhaseToolCalls : null,
    executePhaseToolErrors: hasExecutePhase ? executePhaseToolErrors : null,
    consecutiveMaxErrors,
  };
}

function main() {
  const entries = readAudit();

  // Group by runId for V1+ entries, or by sessionBaseCommit for legacy entries
  // Legacy: runId is null or undefined (pre-V1)
  const runs = new Map<string, AuditEntry[]>();

  for (const entry of entries) {
    // V1+: group by runId
    // Legacy: group by sessionBaseCommit (with "null" for null values)
    const key = entry.runId ?? entry.sessionBaseCommit ?? "null";
    const group = runs.get(key) ?? [];
    group.push(entry);
    runs.set(key, group);
  }

  // Sort entries within each run by timestamp
  for (const entries of runs.values()) {
    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  // Collect run_start timestamps from V1+ runs for abandonment detection
  const v1RunStarts = new Map<string | null, number>();
  for (const [key, runEntries] of runs.entries()) {
    const runId = runEntries.find(
      (e) => e.event === "run_start"
    )?.runId ?? null;
    const runStartEvent = runEntries.find(
      (e) => e.event === "run_start"
    );
    if (runStartEvent && runId !== null) {
      v1RunStarts.set(runId, new Date(runStartEvent.timestamp).getTime());
    }
  }

  const results: RunEval[] = [];

  for (const [key, runEntries] of runs.entries()) {
    // Determine runId: from run_start event for V1+, null for legacy
    const runStartEvent = runEntries.find((e) => e.event === "run_start");
    const runId = runStartEvent?.runId ?? null;

    // Find base commit from first event
    const baseCommit = runEntries[0]?.sessionBaseCommit ?? null;

    // Find task description from run_start event
    const taskDescription = runStartEvent?.taskDescription ?? "unknown";

    // For abandonment detection: collect run_start timestamps of OTHER V1+ runs
    let otherRunStartsAfterThis: number[] = [];
    if (runId !== null) {
      const thisRunStart = v1RunStarts.get(runId);
      if (thisRunStart !== undefined) {
        otherRunStartsAfterThis = [...v1RunStarts.values()].filter(
          (otherStart) => otherStart > thisRunStart,
        );
      }
    }

    results.push(
      evaluateRun(runId, baseCommit, taskDescription, runEntries, otherRunStartsAfterThis),
    );
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
