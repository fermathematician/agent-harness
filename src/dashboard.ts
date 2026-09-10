import fs from "node:fs";
import type { RunEval, RunStatus } from "./models.ts";

export const DEFAULT_RUN_EVALS_FILE = "evals/results/run-evals.jsonl";

export interface RunFilter {
  runId?: string | null;
  status?: RunStatus;
  baseCommit?: string | null;
  model?: string | null;
  taskDescription?: string;
  from?: string;
  to?: string;
}

export interface GuardrailAggregate {
  totalBlockedAttempts: number;
  averageBlockedAttemptsPerRun: number | null;
  totalGitMutationAttempts: number;
  averageGitMutationAttemptsPerRun: number | null;
  totalProtectedPathAttempts: number;
  averageProtectedPathAttemptsPerRun: number | null;
  totalPlanModeBlocks: number;
  averagePlanModeBlocksPerRun: number | null;
}

export interface RunAggregate extends GuardrailAggregate {
  totalRuns: number;
  completedRuns: number;
  activeRuns: number;
  abandonedRuns: number;
  testPassRate: number | null;
  typecheckPassRate: number | null;
  averageRunDurationMs: number | null;
  averagePlanDurationMs: number | null;
  averageExecuteDurationMs: number | null;
  averageToolCallsPerRun: number | null;
  averageToolErrorsPerRun: number | null;
  averageReadBeforeEditRatio: number | null;
  averageFilesReadPerRun: number | null;
  averageFilesChangedPerRun: number | null;
  averageBashCallsPerRun: number | null;
  averageConsecutiveMaxErrors: number | null;
}

export interface ToolUsage {
  tool: string;
  totalCalls: number;
  averageCallsPerRun: number | null;
  share: number | null;
}

export interface ToolUsageAggregate {
  totalToolCalls: number;
  tools: ToolUsage[];
}

export interface PhaseMetricAggregate {
  runCount: number;
  totalToolCalls: number;
  totalToolErrors: number;
  averageDurationMs: number | null;
}

export interface PhaseAggregate {
  plan: PhaseMetricAggregate;
  execute: PhaseMetricAggregate;
}

export type ComparisonDimension = "model" | "taskDescription" | "baseCommit";

export interface RunGroupComparison {
  key: string | null;
  runs: RunEval[];
  aggregate: RunAggregate;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return sum(values) / values.length;
}

function passRate(
  runs: readonly RunEval[],
  key: "testStatus" | "typecheckStatus",
): number | null {
  const relevantRuns = runs.filter((run) => run[key] !== "not_run");

  if (relevantRuns.length === 0) {
    return null;
  }

  const passedRuns = relevantRuns.filter((run) => run[key] === "passed");
  return passedRuns.length / relevantRuns.length;
}

export function loadRunEvals(
  filePath = DEFAULT_RUN_EVALS_FILE,
): RunEval[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunEval);
}

export function filterRuns(
  runs: readonly RunEval[],
  filter: RunFilter = {},
): RunEval[] {
  const {
    runId,
    status,
    baseCommit,
    model,
    taskDescription,
    from,
    to,
  } = filter;

  const fromMs = from === undefined ? undefined : new Date(from).getTime();
  const toMs = to === undefined ? undefined : new Date(to).getTime();

  return runs.filter((run) => {
    if (runId !== undefined && run.runId !== runId) {
      return false;
    }

    if (status !== undefined && run.status !== status) {
      return false;
    }

    if (baseCommit !== undefined && run.baseCommit !== baseCommit) {
      return false;
    }

    if (model !== undefined && run.model !== model) {
      return false;
    }

    if (
      taskDescription !== undefined &&
      run.taskDescription !== taskDescription
    ) {
      return false;
    }

    const runStartMs = new Date(run.runStart).getTime();

    if (fromMs !== undefined && runStartMs < fromMs) {
      return false;
    }

    if (toMs !== undefined && runStartMs > toMs) {
      return false;
    }

    return true;
  });
}

export function aggregateGuardrails(
  runs: readonly RunEval[],
): GuardrailAggregate {
  const blockedAttempts = runs.map((run) => run.blockedAttempts);
  const gitMutationAttempts = runs.map((run) => run.gitMutationAttempts);
  const protectedPathAttempts = runs.map((run) => run.protectedPathAttempts);
  const planModeBlocks = runs.map((run) => run.planModeBlocks);

  return {
    totalBlockedAttempts: sum(blockedAttempts),
    averageBlockedAttemptsPerRun: average(blockedAttempts),
    totalGitMutationAttempts: sum(gitMutationAttempts),
    averageGitMutationAttemptsPerRun: average(gitMutationAttempts),
    totalProtectedPathAttempts: sum(protectedPathAttempts),
    averageProtectedPathAttemptsPerRun: average(protectedPathAttempts),
    totalPlanModeBlocks: sum(planModeBlocks),
    averagePlanModeBlocksPerRun: average(planModeBlocks),
  };
}

export function aggregateRuns(runs: readonly RunEval[]): RunAggregate {
  const totalRuns = runs.length;
  const guardrails = aggregateGuardrails(runs);

  return {
    ...guardrails,
    totalRuns,
    completedRuns: runs.filter((run) => run.status === "completed").length,
    activeRuns: runs.filter((run) => run.status === "active").length,
    abandonedRuns: runs.filter((run) => run.status === "abandoned").length,
    testPassRate: passRate(runs, "testStatus"),
    typecheckPassRate: passRate(runs, "typecheckStatus"),
    averageRunDurationMs: average(runs.map((run) => run.runDurationMs)),
    averagePlanDurationMs: average(
      runs
        .map((run) => run.planPhaseDurationMs)
        .filter((value): value is number => value !== null),
    ),
    averageExecuteDurationMs: average(
      runs
        .map((run) => run.executePhaseDurationMs)
        .filter((value): value is number => value !== null),
    ),
    averageToolCallsPerRun: average(runs.map((run) => run.totalToolCalls)),
    averageToolErrorsPerRun: average(runs.map((run) => run.toolErrors)),
    averageReadBeforeEditRatio: average(runs.map((run) => run.readBeforeEdit)),
    averageFilesReadPerRun: average(runs.map((run) => run.filesRead)),
    averageFilesChangedPerRun: average(runs.map((run) => run.filesChanged)),
    averageBashCallsPerRun: average(runs.map((run) => run.bashCalls)),
    averageConsecutiveMaxErrors: average(
      runs.map((run) => run.consecutiveMaxErrors),
    ),
  };
}

export function aggregateToolUsage(
  runs: readonly RunEval[],
): ToolUsageAggregate {
  const totalRuns = runs.length;
  const toolTotals = new Map<string, number>();
  let totalToolCalls = 0;

  for (const run of runs) {
    for (const [tool, count] of Object.entries(run.toolCallDistribution)) {
      toolTotals.set(tool, (toolTotals.get(tool) ?? 0) + count);
      totalToolCalls += count;
    }
  }

  const tools = [...toolTotals.entries()]
    .map(([tool, totalCalls]) => ({
      tool,
      totalCalls,
      averageCallsPerRun: totalRuns === 0 ? null : totalCalls / totalRuns,
      share: totalToolCalls === 0 ? null : totalCalls / totalToolCalls,
    }))
    .sort((a, b) => {
      if (a.totalCalls !== b.totalCalls) {
        return b.totalCalls - a.totalCalls;
      }

      return a.tool.localeCompare(b.tool);
    });

  return { totalToolCalls, tools };
}

export function aggregatePhases(runs: readonly RunEval[]): PhaseAggregate {
  const planRuns = runs.filter((run) => run.planPhaseToolCalls !== null);
  const executeRuns = runs.filter((run) => run.executePhaseToolCalls !== null);

  return {
    plan: {
      runCount: planRuns.length,
      totalToolCalls: sum(
        planRuns.map((run) => run.planPhaseToolCalls ?? 0),
      ),
      totalToolErrors: sum(
        planRuns.map((run) => run.planPhaseToolErrors ?? 0),
      ),
      averageDurationMs: average(
        runs
          .map((run) => run.planPhaseDurationMs)
          .filter((value): value is number => value !== null),
      ),
    },
    execute: {
      runCount: executeRuns.length,
      totalToolCalls: sum(
        executeRuns.map((run) => run.executePhaseToolCalls ?? 0),
      ),
      totalToolErrors: sum(
        executeRuns.map((run) => run.executePhaseToolErrors ?? 0),
      ),
      averageDurationMs: average(
        runs
          .map((run) => run.executePhaseDurationMs)
          .filter((value): value is number => value !== null),
      ),
    },
  };
}

export function compareRuns(
  runs: readonly RunEval[],
  groupBy: ComparisonDimension,
): RunGroupComparison[] {
  const groups = new Map<string | null, RunEval[]>();

  for (const run of runs) {
    const key = run[groupBy];
    const existing = groups.get(key) ?? [];
    existing.push(run);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .map(([key, groupRuns]) => ({
      key,
      runs: groupRuns,
      aggregate: aggregateRuns(groupRuns),
    }))
    .sort((a, b) => {
      if (a.key === null && b.key === null) {
        return 0;
      }

      if (a.key === null) {
        return 1;
      }

      if (b.key === null) {
        return -1;
      }

      return a.key.localeCompare(b.key);
    });
}
