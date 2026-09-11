import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { RunEval, RunStatus } from "./models.ts";
import {
  aggregateGuardrails,
  aggregatePhases,
  aggregateRuns,
  aggregateToolUsage,
  compareRuns,
  filterRuns,
  loadRunEvals,
  type GuardrailAggregate,
  type PhaseAggregate,
  type RunAggregate,
  type RunFilter,
  type RunGroupComparison,
  type ToolUsageAggregate,
} from "./dashboard.ts";

export interface DashboardPayload {
  runs: RunEval[];
  overview: RunAggregate;
  phases: PhaseAggregate;
  toolUsage: ToolUsageAggregate;
  guardrails: GuardrailAggregate;
  comparisons: {
    model: RunGroupComparison[];
    taskDescription: RunGroupComparison[];
    baseCommit: RunGroupComparison[];
  };
}

export interface DashboardServerOptions {
  runEvalsFile?: string;
  publicDir?: string;
}

const DEFAULT_RUN_EVALS_FILE = "evals/results/run-evals.jsonl";
const DEFAULT_PUBLIC_DIR = "public";

const STATIC_ASSETS = new Set(["/", "/app.js", "/styles.css"]);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export function buildDashboardPayload(
  runs: readonly RunEval[],
  filter: RunFilter = {},
): DashboardPayload {
  const filteredRuns = filterRuns(runs, filter);

  return {
    runs: filteredRuns,
    overview: aggregateRuns(filteredRuns),
    phases: aggregatePhases(filteredRuns),
    toolUsage: aggregateToolUsage(filteredRuns),
    guardrails: aggregateGuardrails(filteredRuns),
    comparisons: {
      model: compareRuns(filteredRuns, "model"),
      taskDescription: compareRuns(filteredRuns, "taskDescription"),
      baseCommit: compareRuns(filteredRuns, "baseCommit"),
    },
  };
}

function stringParam(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function parseRunFilter(
  searchParams: URLSearchParams,
): RunFilter {
  const filter: RunFilter = {};

  const status = searchParams.get("status");
  if (
    status === "completed" ||
    status === "active" ||
    status === "abandoned"
  ) {
    filter.status = status as RunStatus;
  }

  const model = searchParams.get("model");
  if (model === "null") {
    filter.model = null;
  } else if (model !== null && model.trim() !== "") {
    filter.model = model;
  }

  const baseCommit = searchParams.get("baseCommit");
  if (baseCommit === "null") {
    filter.baseCommit = null;
  } else if (baseCommit !== null && baseCommit.trim() !== "") {
    filter.baseCommit = baseCommit;
  }

  const taskDescription = stringParam(searchParams.get("taskDescription"));
  if (taskDescription !== undefined) {
    filter.taskDescription = taskDescription;
  }

  const from = stringParam(searchParams.get("from"));
  if (from !== undefined) {
    filter.from = from;
  }

  const to = stringParam(searchParams.get("to"));
  if (to !== undefined) {
    filter.to = to;
  }

  const runId = searchParams.get("runId");
  if (runId === "null") {
    filter.runId = null;
  } else if (runId !== null && runId.trim() !== "") {
    filter.runId = runId;
  }

  if (searchParams.get("legacy") === "true") {
    filter.runId = null;
  }

  return filter;
}

export function createDashboardServer(
  options: DashboardServerOptions = {},
): http.Server {
  const runEvalsFile = path.resolve(
    options.runEvalsFile ?? DEFAULT_RUN_EVALS_FILE,
  );
  const publicDir = path.resolve(options.publicDir ?? DEFAULT_PUBLIC_DIR);

  return http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      try {
        const runs = loadRunEvals(runEvalsFile);
        const payload = buildDashboardPayload(
          runs,
          parseRunFilter(url.searchParams),
        );

        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify(payload));
      } catch {
        response.writeHead(500, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify({ error: "Failed to load RunEval data" }));
      }

      return;
    }

    if (request.method === "GET" && STATIC_ASSETS.has(url.pathname)) {
      const relativePath =
        url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const filePath = path.join(publicDir, relativePath);

      try {
        const content = fs.readFileSync(filePath);
        const extension = path.extname(filePath);

        response.writeHead(200, {
          "content-type":
            CONTENT_TYPES[extension] ?? "application/octet-stream",
        });
        response.end(content);
      } catch {
        response.writeHead(404, {
          "content-type": "text/plain; charset=utf-8",
        });
        response.end("Not found");
      }

      return;
    }

    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
  });
}


