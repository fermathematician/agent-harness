"use strict";

/**
 * Tests for the Task 005 dashboard UI data path.
 *
 * The dashboard server and backend are TypeScript while the repository
 * package.json is "commonjs". Following the existing test pattern, these
 * tests copy the UI server, the Task 004 backend, and the canonical models
 * into a scratch "type": "module" directory and load them with a dynamic
 * import.
 *
 * The tests exercise the real implementation: buildDashboardPayload must
 * delegate to src/dashboard.ts, and the HTTP endpoint must serve that payload
 * and the real static UI assets.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "dashboard-ui-test");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

let dashboardUi;

test.before(async () => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  const moduleDir = path.join(CACHE_DIR, `run-${process.pid}-${Date.now()}`);
  const srcDir = path.join(moduleDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  fs.copyFileSync(
    path.join(REPO_ROOT, "src", "dashboard-ui.ts"),
    path.join(srcDir, "dashboard-ui.ts"),
  );
  fs.copyFileSync(
    path.join(REPO_ROOT, "src", "dashboard.ts"),
    path.join(srcDir, "dashboard.ts"),
  );
  fs.copyFileSync(
    path.join(REPO_ROOT, "src", "models.ts"),
    path.join(srcDir, "models.ts"),
  );
  fs.writeFileSync(
    path.join(moduleDir, "package.json"),
    JSON.stringify({ type: "module" }),
    "utf8",
  );

  dashboardUi = await import(
    pathToFileURL(path.join(srcDir, "dashboard-ui.ts")).href
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

function writeRunEvals(dir, runs) {
  const file = path.join(dir, "run-evals.jsonl");
  fs.writeFileSync(
    file,
    runs.map((run) => JSON.stringify(run)).join("\n") + "\n",
    "utf8",
  );
  return file;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

function httpGet(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: "127.0.0.1", port, path: requestPath },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            contentType: response.headers["content-type"] ?? "",
            body,
          });
        });
      },
    );

    request.on("error", reject);
  });
}

test("buildDashboardPayload uses the real Task 004 backend and returns all sections", () => {
  const runs = [
    runFixture({
      runId: "r1",
      status: "completed",
      model: null,
      testStatus: "passed",
      typecheckStatus: "failed",
    }),
    runFixture({
      runId: "r2",
      status: "active",
      model: "gpt",
      testStatus: "not_run",
      typecheckStatus: "not_run",
    }),
  ];

  const payload = dashboardUi.buildDashboardPayload(runs);

  assert.equal(payload.runs.length, 2);
  assert.equal(payload.overview.totalRuns, 2);
  assert.equal(payload.overview.completedRuns, 1);
  assert.equal(payload.overview.activeRuns, 1);
  assert.equal(payload.overview.abandonedRuns, 0);
  assert.equal(payload.overview.testPassRate, 1);
  assert.equal(payload.overview.typecheckPassRate, 0);
  assert.equal(payload.toolUsage.totalToolCalls, 20);
  assert.equal(payload.toolUsage.tools.length, 3);
  assert.equal(payload.guardrails.totalBlockedAttempts, 4);
  assert.equal(payload.phases.plan.runCount, 2);
  assert.equal(payload.phases.execute.runCount, 2);
  assert.deepEqual(
    payload.comparisons.model.map((group) => group.key),
    ["gpt", null],
  );
});

test("buildDashboardPayload filters Runs without mutating the source array", () => {
  const runs = [
    runFixture({ runId: "r1", status: "completed" }),
    runFixture({ runId: "r2", status: "active" }),
  ];

  const payload = dashboardUi.buildDashboardPayload(runs, {
    status: "completed",
  });

  assert.equal(payload.runs.length, 1);
  assert.equal(payload.runs[0].runId, "r1");
  assert.equal(payload.overview.totalRuns, 1);
  assert.equal(runs.length, 2);
});

test("parseRunFilter maps query parameters to the Task 004 RunFilter", () => {
  const params = new URLSearchParams([
    ["status", "completed"],
    ["model", "null"],
    ["baseCommit", "abc123"],
    ["taskDescription", "task"],
    ["from", "2024-01-01T00:00:00.000Z"],
    ["to", "2024-02-01T00:00:00.000Z"],
    ["runId", "null"],
  ]);

  const filter = dashboardUi.parseRunFilter(params);

  assert.equal(filter.status, "completed");
  assert.equal(filter.model, null);
  assert.equal(filter.baseCommit, "abc123");
  assert.equal(filter.taskDescription, "task");
  assert.equal(filter.from, "2024-01-01T00:00:00.000Z");
  assert.equal(filter.to, "2024-02-01T00:00:00.000Z");
  assert.equal(filter.runId, null);
});

test("GET /api/dashboard serves the real backend payload and respects filters", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-ui-"));
  const runEvalsFile = writeRunEvals(dir, [
    runFixture({
      runId: "r1",
      status: "completed",
      model: "gpt",
      baseCommit: "abc",
      taskDescription: "task one",
    }),
    runFixture({
      runId: null,
      status: "active",
      model: null,
      baseCommit: "def",
      taskDescription: "task two",
    }),
  ]);

  const server = dashboardUi.createDashboardServer({
    runEvalsFile,
    publicDir: PUBLIC_DIR,
  });
  const port = await listen(server);

  try {
    const allResponse = await httpGet(port, "/api/dashboard");
    assert.equal(allResponse.status, 200);
    const allPayload = JSON.parse(allResponse.body);
    assert.equal(allPayload.runs.length, 2);
    assert.equal(allPayload.overview.totalRuns, 2);

    const completedResponse = await httpGet(
      port,
      "/api/dashboard?status=completed",
    );
    assert.equal(completedResponse.status, 200);
    const completedPayload = JSON.parse(completedResponse.body);
    assert.equal(completedPayload.runs.length, 1);
    assert.equal(completedPayload.runs[0].runId, "r1");

    const legacyResponse = await httpGet(port, "/api/dashboard?runId=null");
    assert.equal(legacyResponse.status, 200);
    const legacyPayload = JSON.parse(legacyResponse.body);
    assert.equal(legacyPayload.runs.length, 1);
    assert.equal(legacyPayload.runs[0].runId, null);
  } finally {
    await closeServer(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GET /api/dashboard handles a missing dataset without crashing", async () => {
  const server = dashboardUi.createDashboardServer({
    runEvalsFile: path.join(os.tmpdir(), "dashboard-ui-missing.jsonl"),
    publicDir: PUBLIC_DIR,
  });
  const port = await listen(server);

  try {
    const response = await httpGet(port, "/api/dashboard");
    assert.equal(response.status, 200);

    const payload = JSON.parse(response.body);
    assert.deepEqual(payload.runs, []);
    assert.equal(payload.overview.totalRuns, 0);
    assert.equal(payload.overview.testPassRate, null);
    assert.equal(payload.overview.typecheckPassRate, null);
    assert.equal(payload.overview.averagePlanDurationMs, null);
    assert.equal(payload.overview.averageExecuteDurationMs, null);
    assert.equal(payload.toolUsage.totalToolCalls, 0);
    assert.deepEqual(payload.toolUsage.tools, []);
    assert.equal(payload.guardrails.totalBlockedAttempts, 0);
    assert.equal(payload.phases.plan.runCount, 0);
    assert.equal(payload.phases.execute.runCount, 0);
  } finally {
    await closeServer(server);
  }
});

test("GET /api/dashboard keeps null and not-applicable values identifiable", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-ui-null-"));
  const runEvalsFile = writeRunEvals(dir, [
    runFixture({
      runId: null,
      model: null,
      testStatus: "not_run",
      typecheckStatus: "not_run",
      planPhaseDurationMs: null,
      executePhaseDurationMs: null,
      planPhaseToolCalls: null,
      planPhaseToolErrors: null,
      executePhaseToolCalls: null,
      executePhaseToolErrors: null,
      toolCallDistribution: {},
      blockedAttempts: 0,
      gitMutationAttempts: 0,
      protectedPathAttempts: 0,
      planModeBlocks: 0,
    }),
  ]);

  const server = dashboardUi.createDashboardServer({
    runEvalsFile,
    publicDir: PUBLIC_DIR,
  });
  const port = await listen(server);

  try {
    const response = await httpGet(port, "/api/dashboard");
    assert.equal(response.status, 200);

    const payload = JSON.parse(response.body);
    assert.equal(payload.runs[0].runId, null);
    assert.equal(payload.runs[0].model, null);
    assert.equal(payload.overview.testPassRate, null);
    assert.equal(payload.overview.typecheckPassRate, null);
    assert.equal(payload.overview.averagePlanDurationMs, null);
    assert.equal(payload.overview.averageExecuteDurationMs, null);
    assert.equal(payload.phases.plan.runCount, 0);
    assert.equal(payload.phases.execute.runCount, 0);
    assert.equal(payload.toolUsage.totalToolCalls, 0);

    const nullModelGroup = payload.comparisons.model.find(
      (group) => group.key === null,
    );
    assert.ok(nullModelGroup);
    assert.equal(nullModelGroup.aggregate.totalRuns, 1);
  } finally {
    await closeServer(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("dashboard server serves its static UI assets", async () => {
  const server = dashboardUi.createDashboardServer({
    runEvalsFile: path.join(os.tmpdir(), "dashboard-ui-missing.jsonl"),
    publicDir: PUBLIC_DIR,
  });
  const port = await listen(server);

  try {
    const html = await httpGet(port, "/");
    assert.equal(html.status, 200);
    assert.match(html.contentType, /text\/html/);
    assert.match(html.body, /Agent Harness Dashboard/);

    const js = await httpGet(port, "/app.js");
    assert.equal(js.status, 200);
    assert.match(js.body, /loadDashboard/);

    const css = await httpGet(port, "/styles.css");
    assert.equal(css.status, 200);
    assert.match(css.body, /color-scheme/);
  } finally {
    await closeServer(server);
  }
});
