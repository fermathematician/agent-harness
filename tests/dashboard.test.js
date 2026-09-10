"use strict";

/**
 * Tests for the Task 004 dashboard backend.
 *
 * The backend is TypeScript while the repository package.json is "commonjs",
 * so Node cannot load `src/dashboard.ts` directly as an ES module. Following
 * the same approach as tests/audit.test.js, these tests copy the backend and
 * the canonical models file into a scratch module directory with its own
 * "type": "module" package.json and load the copy with a dynamic import.
 *
 * The tests pass in-memory RunEval fixtures for aggregation functions and
 * temporary files for loadRunEvals. They never write to the real
 * evals/results directory.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");
const DASHBOARD_SOURCE = path.join(REPO_ROOT, "src", "dashboard.ts");
const MODELS_SOURCE = path.join(REPO_ROOT, "src", "models.ts");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "dashboard-test");

let dashboard;

test.before(async () => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  const moduleDir = path.join(CACHE_DIR, `run-${process.pid}-${Date.now()}`);
  const srcDir = path.join(moduleDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  fs.copyFileSync(DASHBOARD_SOURCE, path.join(srcDir, "dashboard.ts"));
  fs.copyFileSync(MODELS_SOURCE, path.join(srcDir, "models.ts"));
  fs.writeFileSync(
    path.join(moduleDir, "package.json"),
    JSON.stringify({ type: "module" }),
    "utf8",
  );

  dashboard = await import(
    pathToFileURL(path.join(srcDir, "dashboard.ts")).href
  );
});

test.after(() => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
});

function runFixture(overrides = {}) {
  return {
    schemaVersion: "1",
    evaluatorVersion: "1",
    runId: "run-1",
    baseCommit: "abc123",
    taskDescription: "task",
    model: null,
    status: "completed",
    runStart: "2024-01-01T00:00:00.000Z",
    runEnd: "2024-01-01T00:10:00.000Z",
    runDurationMs: 600000,
    planPhaseDurationMs: 100000,
    executePhaseDurationMs: 500000,
    hasPlanPhase: true,
    hasExecutePhase: true,
    testStatus: "passed",
    typecheckStatus: "passed",
    gitStatusChecked: true,
    diffReviewed: true,
    readBeforeEdit: 1,
    totalToolCalls: 10,
    filesRead: 5,
    filesChanged: 3,
    bashCalls: 4,
    toolErrors: 1,
    toolCallDistribution: { read: 5, bash: 4, edit: 1 },
    blockedAttempts: 2,
    gitMutationAttempts: 1,
    protectedPathAttempts: 0,
    planModeBlocks: 1,
    planPhaseToolCalls: 4,
    planPhaseToolErrors: 0,
    executePhaseToolCalls: 6,
    executePhaseToolErrors: 1,
    consecutiveMaxErrors: 1,
    ...overrides,
  };
}

test("loadRunEvals parses JSONL and returns [] for a missing file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-load-"));
  const file = path.join(dir, "run-evals.jsonl");
  const fixtures = [
    runFixture({ runId: "run-a" }),
    runFixture({ runId: "run-b" }),
  ];

  fs.writeFileSync(
    file,
    fixtures.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    "utf8",
  );

  try {
    const runs = dashboard.loadRunEvals(file);
    assert.equal(runs.length, 2);
    assert.equal(runs[0].runId, "run-a");
    assert.equal(runs[1].runId, "run-b");

    assert.deepEqual(
      dashboard.loadRunEvals(path.join(dir, "missing.jsonl")),
      [],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("filterRuns filters by V1 dimensions without mutating the source", () => {
  const runs = [
    runFixture({
      runId: "r1",
      status: "completed",
      baseCommit: "abc",
      model: null,
      taskDescription: "task one",
      runStart: "2024-01-01T00:00:00.000Z",
    }),
    runFixture({
      runId: null,
      status: "active",
      baseCommit: "def",
      model: "gpt",
      taskDescription: "task two",
      runStart: "2024-02-01T00:00:00.000Z",
    }),
    runFixture({
      runId: "r3",
      status: "abandoned",
      baseCommit: "abc",
      model: null,
      taskDescription: "task one",
      runStart: "2024-03-01T00:00:00.000Z",
    }),
  ];

  assert.equal(dashboard.filterRuns(runs, { status: "completed" }).length, 1);
  assert.equal(dashboard.filterRuns(runs, { runId: null }).length, 1);
  assert.equal(dashboard.filterRuns(runs, { baseCommit: "abc" }).length, 2);
  assert.equal(dashboard.filterRuns(runs, { model: null }).length, 2);
  assert.equal(
    dashboard.filterRuns(runs, { taskDescription: "task one" }).length,
    2,
  );
  assert.equal(
    dashboard.filterRuns(runs, { from: "2024-02-01T00:00:00.000Z" }).length,
    2,
  );
  assert.equal(
    dashboard.filterRuns(runs, {
      from: "2024-02-01T00:00:00.000Z",
      to: "2024-02-01T00:00:00.000Z",
    }).length,
    1,
  );
  assert.equal(runs.length, 3);
});

test("aggregate functions handle an empty dataset predictably", () => {
  const aggregate = dashboard.aggregateRuns([]);
  assert.equal(aggregate.totalRuns, 0);
  assert.equal(aggregate.completedRuns, 0);
  assert.equal(aggregate.activeRuns, 0);
  assert.equal(aggregate.abandonedRuns, 0);
  assert.equal(aggregate.testPassRate, null);
  assert.equal(aggregate.typecheckPassRate, null);
  assert.equal(aggregate.averageRunDurationMs, null);
  assert.equal(aggregate.averagePlanDurationMs, null);
  assert.equal(aggregate.averageExecuteDurationMs, null);
  assert.equal(aggregate.averageToolCallsPerRun, null);
  assert.equal(aggregate.averageToolErrorsPerRun, null);
  assert.equal(aggregate.totalBlockedAttempts, 0);
  assert.equal(aggregate.averageBlockedAttemptsPerRun, null);

  assert.deepEqual(dashboard.aggregateToolUsage([]), {
    totalToolCalls: 0,
    tools: [],
  });

  const phases = dashboard.aggregatePhases([]);
  assert.equal(phases.plan.runCount, 0);
  assert.equal(phases.plan.totalToolCalls, 0);
  assert.equal(phases.plan.totalToolErrors, 0);
  assert.equal(phases.plan.averageDurationMs, null);
  assert.equal(phases.execute.runCount, 0);
  assert.equal(phases.execute.totalToolCalls, 0);
  assert.equal(phases.execute.totalToolErrors, 0);
  assert.equal(phases.execute.averageDurationMs, null);

  const guardrails = dashboard.aggregateGuardrails([]);
  assert.equal(guardrails.totalBlockedAttempts, 0);
  assert.equal(guardrails.averageBlockedAttemptsPerRun, null);
  assert.equal(guardrails.totalGitMutationAttempts, 0);
  assert.equal(guardrails.averageGitMutationAttemptsPerRun, null);
  assert.equal(guardrails.totalProtectedPathAttempts, 0);
  assert.equal(guardrails.averageProtectedPathAttemptsPerRun, null);
  assert.equal(guardrails.totalPlanModeBlocks, 0);
  assert.equal(guardrails.averagePlanModeBlocksPerRun, null);
});

test("aggregateRuns counts statuses and computes per-run averages", () => {
  const runs = [
    runFixture({
      runId: "r1",
      status: "completed",
      runDurationMs: 1000,
      totalToolCalls: 4,
      toolErrors: 1,
      readBeforeEdit: 1,
      filesRead: 3,
      filesChanged: 1,
      bashCalls: 2,
      consecutiveMaxErrors: 1,
    }),
    runFixture({
      runId: "r2",
      status: "active",
      runDurationMs: 3000,
      totalToolCalls: 8,
      toolErrors: 3,
      readBeforeEdit: 0.5,
      filesRead: 5,
      filesChanged: 2,
      bashCalls: 4,
      consecutiveMaxErrors: 2,
    }),
  ];

  const aggregate = dashboard.aggregateRuns(runs);
  assert.equal(aggregate.totalRuns, 2);
  assert.equal(aggregate.completedRuns, 1);
  assert.equal(aggregate.activeRuns, 1);
  assert.equal(aggregate.abandonedRuns, 0);
  assert.equal(aggregate.averageRunDurationMs, 2000);
  assert.equal(aggregate.averageToolCallsPerRun, 6);
  assert.equal(aggregate.averageToolErrorsPerRun, 2);
  assert.equal(aggregate.averageReadBeforeEditRatio, 0.75);
  assert.equal(aggregate.averageFilesReadPerRun, 4);
  assert.equal(aggregate.averageFilesChangedPerRun, 1.5);
  assert.equal(aggregate.averageBashCallsPerRun, 3);
  assert.equal(aggregate.averageConsecutiveMaxErrors, 1.5);
});

test("pass rates exclude not_run and return null when no tests ran", () => {
  const aggregate = dashboard.aggregateRuns([
    runFixture({ testStatus: "passed", typecheckStatus: "failed" }),
    runFixture({ testStatus: "failed", typecheckStatus: "passed" }),
    runFixture({ testStatus: "not_run", typecheckStatus: "not_run" }),
  ]);

  assert.equal(aggregate.testPassRate, 0.5);
  assert.equal(aggregate.typecheckPassRate, 0.5);

  const none = dashboard.aggregateRuns([
    runFixture({ testStatus: "not_run", typecheckStatus: "not_run" }),
  ]);
  assert.equal(none.testPassRate, null);
  assert.equal(none.typecheckPassRate, null);
});

test("PLAN and EXECUTE duration averages ignore missing phases", () => {
  const runs = [
    runFixture({ planPhaseDurationMs: 100, executePhaseDurationMs: 300 }),
    runFixture({ planPhaseDurationMs: null, executePhaseDurationMs: 500 }),
    runFixture({ planPhaseDurationMs: 200, executePhaseDurationMs: null }),
  ];

  const aggregate = dashboard.aggregateRuns(runs);
  assert.equal(aggregate.averagePlanDurationMs, 150);
  assert.equal(aggregate.averageExecuteDurationMs, 400);
});

test("aggregatePhases excludes runs without each phase", () => {
  const runs = [
    runFixture({
      planPhaseToolCalls: 4,
      planPhaseToolErrors: 1,
      planPhaseDurationMs: 100,
      executePhaseToolCalls: 6,
      executePhaseToolErrors: 2,
      executePhaseDurationMs: 300,
    }),
    runFixture({
      hasPlanPhase: false,
      planPhaseToolCalls: null,
      planPhaseToolErrors: null,
      planPhaseDurationMs: null,
      executePhaseToolCalls: 8,
      executePhaseToolErrors: 0,
      executePhaseDurationMs: 500,
    }),
    runFixture({
      planPhaseToolCalls: 2,
      planPhaseToolErrors: 0,
      planPhaseDurationMs: 200,
      hasExecutePhase: false,
      executePhaseToolCalls: null,
      executePhaseToolErrors: null,
      executePhaseDurationMs: null,
    }),
  ];

  const phases = dashboard.aggregatePhases(runs);
  assert.equal(phases.plan.runCount, 2);
  assert.equal(phases.plan.totalToolCalls, 6);
  assert.equal(phases.plan.totalToolErrors, 1);
  assert.equal(phases.plan.averageDurationMs, 150);
  assert.equal(phases.execute.runCount, 2);
  assert.equal(phases.execute.totalToolCalls, 14);
  assert.equal(phases.execute.totalToolErrors, 2);
  assert.equal(phases.execute.averageDurationMs, 400);
});

test("aggregateToolUsage merges tool distributions", () => {
  const runs = [
    runFixture({ toolCallDistribution: { read: 2, bash: 2 } }),
    runFixture({ toolCallDistribution: { read: 3, write: 1 } }),
  ];

  const usage = dashboard.aggregateToolUsage(runs);
  assert.equal(usage.totalToolCalls, 8);

  const read = usage.tools.find((tool) => tool.tool === "read");
  assert.equal(read.totalCalls, 5);
  assert.equal(read.averageCallsPerRun, 2.5);
  assert.equal(read.share, 0.625);

  const bash = usage.tools.find((tool) => tool.tool === "bash");
  assert.equal(bash.totalCalls, 2);
  assert.equal(bash.averageCallsPerRun, 1);
  assert.equal(bash.share, 0.25);
});

test("aggregateGuardrails reports totals and per-run averages", () => {
  const runs = [
    runFixture({
      blockedAttempts: 2,
      gitMutationAttempts: 1,
      protectedPathAttempts: 0,
      planModeBlocks: 1,
    }),
    runFixture({
      blockedAttempts: 4,
      gitMutationAttempts: 0,
      protectedPathAttempts: 2,
      planModeBlocks: 3,
    }),
  ];

  const guardrails = dashboard.aggregateGuardrails(runs);
  assert.equal(guardrails.totalBlockedAttempts, 6);
  assert.equal(guardrails.averageBlockedAttemptsPerRun, 3);
  assert.equal(guardrails.totalGitMutationAttempts, 1);
  assert.equal(guardrails.averageGitMutationAttemptsPerRun, 0.5);
  assert.equal(guardrails.totalProtectedPathAttempts, 2);
  assert.equal(guardrails.averageProtectedPathAttemptsPerRun, 1);
  assert.equal(guardrails.totalPlanModeBlocks, 4);
  assert.equal(guardrails.averagePlanModeBlocksPerRun, 2);
});

test("compareRuns groups by model, taskDescription, and baseCommit", () => {
  const runs = [
    runFixture({
      runId: "r1",
      model: null,
      baseCommit: "abc",
      taskDescription: "task-a",
    }),
    runFixture({
      runId: "r2",
      model: "gpt",
      baseCommit: "abc",
      taskDescription: "task-b",
    }),
    runFixture({
      runId: "r3",
      model: "gpt",
      baseCommit: "def",
      taskDescription: "task-a",
    }),
  ];

  const byModel = dashboard.compareRuns(runs, "model");
  assert.deepEqual(byModel.map((group) => group.key), ["gpt", null]);
  assert.equal(byModel[0].aggregate.totalRuns, 2);
  assert.equal(byModel[1].aggregate.totalRuns, 1);

  const byTask = dashboard.compareRuns(runs, "taskDescription");
  assert.deepEqual(byTask.map((group) => group.key), ["task-a", "task-b"]);
  assert.equal(byTask[0].aggregate.totalRuns, 2);
  assert.equal(byTask[1].aggregate.totalRuns, 1);

  const byBase = dashboard.compareRuns(runs, "baseCommit");
  assert.deepEqual(byBase.map((group) => group.key), ["abc", "def"]);
  assert.equal(byBase[0].aggregate.totalRuns, 2);
  assert.equal(byBase[1].aggregate.totalRuns, 1);
});

test("null model records group under a null key without a fake model", () => {
  const groups = dashboard.compareRuns([runFixture({ model: null })], "model");

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, null);
  assert.equal(groups[0].runs[0].model, null);
});

test("legacy runId:null records load, filter, and aggregate", () => {
  const legacy = runFixture({ runId: null });
  const normal = runFixture({ runId: "r1" });
  const runs = [legacy, normal];

  assert.equal(dashboard.filterRuns(runs, { runId: null }).length, 1);

  const aggregate = dashboard.aggregateRuns(runs);
  assert.equal(aggregate.totalRuns, 2);
  assert.equal(aggregate.completedRuns, 2);
});

test("missing or not-applicable values do not become misleading zeros", () => {
  const runs = [
    runFixture({
      testStatus: "not_run",
      typecheckStatus: "not_run",
      planPhaseDurationMs: null,
      executePhaseDurationMs: null,
      planPhaseToolCalls: null,
      planPhaseToolErrors: null,
      executePhaseToolCalls: null,
      executePhaseToolErrors: null,
      toolCallDistribution: {},
    }),
  ];

  const aggregate = dashboard.aggregateRuns(runs);
  assert.equal(aggregate.testPassRate, null);
  assert.equal(aggregate.typecheckPassRate, null);
  assert.equal(aggregate.averagePlanDurationMs, null);
  assert.equal(aggregate.averageExecuteDurationMs, null);

  const phases = dashboard.aggregatePhases(runs);
  assert.equal(phases.plan.runCount, 0);
  assert.equal(phases.plan.averageDurationMs, null);
  assert.equal(phases.execute.runCount, 0);
  assert.equal(phases.execute.averageDurationMs, null);

  const usage = dashboard.aggregateToolUsage(runs);
  assert.equal(usage.totalToolCalls, 0);
  assert.deepEqual(usage.tools, []);
});
