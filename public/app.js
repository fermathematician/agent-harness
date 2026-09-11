"use strict";

const form = document.getElementById("filters");
const refreshButton = document.getElementById("refresh");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadDashboard();
});

form.addEventListener("change", loadDashboard);
refreshButton.addEventListener("click", loadDashboard);

function buildQuery() {
  const data = new FormData(form);
  const params = new URLSearchParams();

  for (const [key, value] of data.entries()) {
    if (key === "legacy") {
      if (value === "true") {
        params.set("runId", "null");
      }
      continue;
    }

    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

function formatNumber(value) {
  return value === null || value === undefined ? "N/A" : String(value);
}

function formatPercent(ratio) {
  if (ratio === null || ratio === undefined) {
    return "N/A";
  }

  return `${(ratio * 100).toFixed(1)}%`;
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) {
    return "N/A";
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainderSeconds}s`;
}

function formatDateTime(value) {
  if (!value) {
    return "N/A";
  }

  return new Date(value).toLocaleString();
}

function formatRunId(runId) {
  return runId === null ? "Unassociated" : runId;
}

function formatModel(model) {
  return model === null ? "Unknown" : model;
}

function formatGroupKey(key) {
  return key === null ? "Unknown / Unassociated" : key;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function clear(element) {
  element.replaceChildren();
}

function renderOverview(overview) {
  const container = document.getElementById("overview-cards");
  clear(container);

  const cards = [
    ["Total Runs", formatNumber(overview.totalRuns)],
    ["Completed", formatNumber(overview.completedRuns)],
    ["Active", formatNumber(overview.activeRuns)],
    ["Abandoned", formatNumber(overview.abandonedRuns)],
    ["Test pass rate", formatPercent(overview.testPassRate)],
    ["Typecheck pass rate", formatPercent(overview.typecheckPassRate)],
    ["Average Run duration", formatDuration(overview.averageRunDurationMs)],
    ["Average PLAN duration", formatDuration(overview.averagePlanDurationMs)],
    [
      "Average EXECUTE duration",
      formatDuration(overview.averageExecuteDurationMs),
    ],
    ["Average tool calls / Run", formatNumber(overview.averageToolCallsPerRun)],
    ["Average tool errors / Run", formatNumber(overview.averageToolErrorsPerRun)],
    [
      "Average read-before-edit",
      formatPercent(overview.averageReadBeforeEditRatio),
    ],
    ["Total blocked attempts", formatNumber(overview.totalBlockedAttempts)],
  ];

  for (const [label, value] of cards) {
    const card = createElement("div", "card");
    card.append(
      createElement("span", "card-label", label),
      createElement("strong", "card-value", value),
    );
    container.append(card);
  }
}

function renderRuns(runs) {
  const body = document.getElementById("runs-body");
  clear(body);

  for (const run of runs) {
    const row = createElement("tr", `run-row run-${run.status}`);

    const values = [
      formatRunId(run.runId),
      run.taskDescription,
      formatModel(run.model),
      run.status,
      formatDateTime(run.runStart),
      formatDuration(run.runDurationMs),
      run.testStatus,
      run.typecheckStatus,
      formatNumber(run.totalToolCalls),
      formatNumber(run.toolErrors),
      formatNumber(run.filesRead),
      formatNumber(run.filesChanged),
      formatNumber(run.blockedAttempts),
    ];

    for (const value of values) {
      row.append(createElement("td", undefined, value));
    }

    body.append(row);
  }

  if (runs.length === 0) {
    const row = createElement("tr");
    const cell = createElement("td", "empty-cell", "No Runs match the current filters.");
    cell.colSpan = 13;
    row.append(cell);
    body.append(row);
  }
}

function renderPhases(phases) {
  const container = document.getElementById("phases-grid");
  clear(container);

  const phaseCards = [
    ["PLAN", phases.plan],
    ["EXECUTE", phases.execute],
  ];

  for (const [label, phase] of phaseCards) {
    const card = createElement("div", "phase-card");
    card.append(createElement("h3", undefined, label));
    card.append(
      createElement("p", undefined, `Runs with phase: ${formatNumber(phase.runCount)}`),
    );
    card.append(
      createElement(
        "p",
        undefined,
        `Average duration: ${formatDuration(phase.averageDurationMs)}`,
      ),
    );
    card.append(
      createElement(
        "p",
        undefined,
        `Total tool calls: ${formatNumber(phase.totalToolCalls)}`,
      ),
    );
    card.append(
      createElement(
        "p",
        undefined,
        `Total tool errors: ${formatNumber(phase.totalToolErrors)}`,
      ),
    );
    container.append(card);
  }
}

function renderToolUsage(toolUsage) {
  const body = document.getElementById("tool-usage-body");
  clear(body);

  for (const tool of toolUsage.tools) {
    const row = createElement("tr");

    row.append(createElement("td", undefined, tool.tool));
    row.append(createElement("td", undefined, formatNumber(tool.totalCalls)));
    row.append(
      createElement("td", undefined, formatNumber(tool.averageCallsPerRun)),
    );

    const shareCell = createElement("td");
    const shareLabel = createElement("span", "share-label", formatPercent(tool.share));
    shareCell.append(shareLabel);

    if (tool.share !== null) {
      const barTrack = createElement("div", "share-track");
      const bar = createElement("div", "share-bar");
      bar.style.width = `${(tool.share * 100).toFixed(1)}%`;
      barTrack.append(bar);
      shareCell.append(barTrack);
    }

    row.append(shareCell);
    body.append(row);
  }

  if (toolUsage.tools.length === 0) {
    const row = createElement("tr");
    const cell = createElement("td", "empty-cell", "No tool calls recorded.");
    cell.colSpan = 4;
    row.append(cell);
    body.append(row);
  }
}

function renderGuardrails(guardrails) {
  const container = document.getElementById("guardrails-cards");
  clear(container);

  const cards = [
    [
      "Blocked attempts",
      guardrails.totalBlockedAttempts,
      guardrails.averageBlockedAttemptsPerRun,
    ],
    [
      "Git mutation attempts",
      guardrails.totalGitMutationAttempts,
      guardrails.averageGitMutationAttemptsPerRun,
    ],
    [
      "Protected path attempts",
      guardrails.totalProtectedPathAttempts,
      guardrails.averageProtectedPathAttemptsPerRun,
    ],
    [
      "PLAN mode blocks",
      guardrails.totalPlanModeBlocks,
      guardrails.averagePlanModeBlocksPerRun,
    ],
  ];

  for (const [label, total, average] of cards) {
    const card = createElement("div", "card");
    card.append(createElement("span", "card-label", label));
    card.append(
      createElement("strong", "card-value", formatNumber(total)),
    );
    card.append(
      createElement(
        "span",
        "card-subvalue",
        `Average / Run: ${formatNumber(average)}`,
      ),
    );
    container.append(card);
  }
}

function renderComparisonTable(title, groups) {
  const section = createElement("div", "comparison-section");
  section.append(createElement("h3", undefined, title));

  const table = createElement("table");
  const header = createElement("thead");
  const headerRow = createElement("tr");

  for (const label of [
    title,
    "Runs",
    "Completed",
    "Test pass",
    "Typecheck pass",
    "Avg duration",
    "Avg tool calls",
    "Blocked",
  ]) {
    headerRow.append(createElement("th", undefined, label));
  }

  header.append(headerRow);
  table.append(header);

  const body = createElement("tbody");
  for (const group of groups) {
    const row = createElement("tr");
    const aggregate = group.aggregate;

    row.append(createElement("td", undefined, formatGroupKey(group.key)));
    row.append(createElement("td", undefined, formatNumber(aggregate.totalRuns)));
    row.append(createElement("td", undefined, formatNumber(aggregate.completedRuns)));
    row.append(createElement("td", undefined, formatPercent(aggregate.testPassRate)));
    row.append(
      createElement("td", undefined, formatPercent(aggregate.typecheckPassRate)),
    );
    row.append(
      createElement(
        "td",
        undefined,
        formatDuration(aggregate.averageRunDurationMs),
      ),
    );
    row.append(
      createElement("td", undefined, formatNumber(aggregate.averageToolCallsPerRun)),
    );
    row.append(
      createElement("td", undefined, formatNumber(aggregate.totalBlockedAttempts)),
    );

    body.append(row);
  }

  table.append(body);
  section.append(table);
  return section;
}

function renderComparisons(comparisons) {
  const container = document.getElementById("comparisons-grid");
  clear(container);

  container.append(
    renderComparisonTable("Model", comparisons.model),
    renderComparisonTable("Task description", comparisons.taskDescription),
    renderComparisonTable("Base commit", comparisons.baseCommit),
  );
}

function render(payload) {
  renderOverview(payload.overview);
  renderRuns(payload.runs);
  renderPhases(payload.phases);
  renderToolUsage(payload.toolUsage);
  renderGuardrails(payload.guardrails);
  renderComparisons(payload.comparisons);
}

async function loadDashboard() {
  try {
    const response = await fetch(`/api/dashboard${buildQuery()}`);
    if (!response.ok) {
      throw new Error(`Dashboard request failed: ${response.status}`);
    }

    render(await response.json());
  } catch (error) {
    document.body.append(
      createElement("p", "error-message", `Failed to load dashboard: ${error.message}`),
    );
  }
}

loadDashboard();
