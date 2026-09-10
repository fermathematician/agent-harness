"use strict";

/**
 * Tests for the harness audit pipeline:
 *   - .pi/extensions/audit.ts     (tool call + execution events)
 *   - .pi/extensions/safety.ts    (guardrail blocks -> guardrail_block events)
 *   - .pi/extensions/plan-mode.ts (plan mode blocks -> guardrail_block events)
 *   - .pi/lib/audit.ts            (shared audit writer used by the extensions)
 *
 * The extensions are TypeScript, while the repository package.json is
 * "commonjs", so Node cannot load the original files as ES modules.
 * Node also refuses type stripping for files under node_modules.
 * The tests therefore copy the extensions and the shared lib into a scratch
 * module directory inside the repository (but outside node_modules, so its
 * imports still resolve), preserving the .pi/ directory layout so that
 * relative imports resolve, with its own "type": "module" package.json and
 * load the copies with a dynamic import. The loaded modules are driven with
 * a fake ExtensionAPI.
 *
 * All audit output goes to a temporary working directory, never to the
 * real .pi/audit log.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");
const EXTENSION_SOURCES = {
  audit: path.join(REPO_ROOT, ".pi", "extensions", "audit.ts"),
  safety: path.join(REPO_ROOT, ".pi", "extensions", "safety.ts"),
  planMode: path.join(REPO_ROOT, ".pi", "extensions", "plan-mode.ts"),
};
const LIB_SOURCE = path.join(REPO_ROOT, ".pi", "lib", "audit.ts");
const MODELS_SOURCE = path.join(REPO_ROOT, "src", "models.ts");
const EVAL_SOURCE = path.join(REPO_ROOT, "evals", "run-eval.ts");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "audit-test");

let moduleDir;
let auditExtension;
let safetyExtension;
let planModeExtension;

test.before(async () => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  moduleDir = path.join(CACHE_DIR, `run-${process.pid}-${Date.now()}`);
  const extensionsDir = path.join(moduleDir, ".pi", "extensions");
  const libDir = path.join(moduleDir, ".pi", "lib");
  const modelsDir = path.join(moduleDir, "src");
  const evalsDir = path.join(moduleDir, "evals");
  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.mkdirSync(evalsDir, { recursive: true });

  fs.copyFileSync(
    EXTENSION_SOURCES.audit,
    path.join(extensionsDir, "audit.ts"),
  );
  fs.copyFileSync(
    EXTENSION_SOURCES.safety,
    path.join(extensionsDir, "safety.ts"),
  );
  fs.copyFileSync(
    EXTENSION_SOURCES.planMode,
    path.join(extensionsDir, "plan-mode.ts"),
  );
  fs.copyFileSync(LIB_SOURCE, path.join(libDir, "audit.ts"));
  fs.copyFileSync(MODELS_SOURCE, path.join(modelsDir, "models.ts"));
  fs.copyFileSync(EVAL_SOURCE, path.join(evalsDir, "run-eval.ts"));
  fs.writeFileSync(
    path.join(moduleDir, "package.json"),
    JSON.stringify({ type: "module" }),
    "utf8",
  );

  const loadExtension = async (name) => {
    const mod = await import(
      pathToFileURL(path.join(moduleDir, ".pi", "extensions", name)).href
    );
    return mod.default;
  };

  auditExtension = await loadExtension("audit.ts");
  safetyExtension = await loadExtension("safety.ts");
  planModeExtension = await loadExtension("plan-mode.ts");
});

test.after(() => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
});

function createFakePi() {
  const handlers = new Map();
  const commands = new Map();
  const state = {
    activeTools: ["read", "bash", "edit", "write"],
  };

  return {
    handlers,
    commands,
    state,
    on(event, handler) {
      const list = handlers.get(event);
      if (list) {
        list.push(handler);
      } else {
        handlers.set(event, [handler]);
      }
    },
    registerCommand(name, options) {
      commands.set(name, options);
    },
    getActiveTools() {
      return [...state.activeTools];
    },
    setActiveTools(tools) {
      state.activeTools = [...tools];
    },
    sendUserMessage() {
      // No-op: user messages are not relevant to these tests.
    },
  };
}

function createContext() {
  return {
    ui: {
      notify: () => {},
      setStatus: () => {},
    },
  };
}

async function emit(pi, eventName, event, ctx = createContext()) {
  let result;
  for (const handler of pi.handlers.get(eventName) ?? []) {
    const handlerResult = await handler(event, ctx);
    if (handlerResult !== undefined) {
      result = handlerResult;
    }
  }
  return result;
}

function createWorkdir({ withGit = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-ext-test-"));
  if (withGit) {
    fs.cpSync(path.join(REPO_ROOT, ".git"), path.join(dir, ".git"), {
      recursive: true,
    });
  }
  return dir;
}

function readAuditEntries(workdir) {
  const file = path.join(workdir, ".pi", "audit", "tool-calls.jsonl");
  return fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function readRunEvals(workdir) {
  const file = path.join(workdir, "evals", "results", "run-evals.jsonl");
  return fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function runEvaluator(workdir) {
  execFileSync(
    process.execPath,
    [path.join(moduleDir, "evals", "run-eval.ts")],
    { cwd: workdir, encoding: "utf8" },
  );
  return readRunEvals(workdir);
}

function evaluateAuditEntries(entries) {
  const workdir = createWorkdir();
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const auditDir = path.join(workdir, ".pi", "audit");
    fs.mkdirSync(auditDir, { recursive: true });
    fs.writeFileSync(
      path.join(auditDir, "tool-calls.jsonl"),
      entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
      "utf8",
    );
    return runEvaluator(workdir);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

function guardrailBlockEntries(workdir) {
  return readAuditEntries(workdir).filter(
    (entry) => entry.event === "guardrail_block",
  );
}

test("records sessionBaseCommit from the current Git HEAD on every audit event", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const pi = createFakePi();
    auditExtension(pi);

    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workdir,
      encoding: "utf8",
    }).trim();

    await emit(pi, "tool_call", {
      toolName: "bash",
      toolCallId: "call-bash-1",
      input: { command: "git status" },
    });
    await emit(pi, "tool_call", {
      toolName: "read",
      toolCallId: "call-read-1",
      input: { path: "README.md", offset: 1, limit: 10 },
    });
    await emit(pi, "tool_call", {
      toolName: "write",
      toolCallId: "call-write-1",
      input: { path: "notes.txt", content: "hello" },
    });
    await emit(pi, "tool_call", {
      toolName: "edit",
      toolCallId: "call-edit-1",
      input: { path: "notes.txt", edits: [] },
    });
    await emit(pi, "tool_call", {
      toolName: "grep",
      toolCallId: "call-grep-1",
      input: { pattern: "foo" },
    });
    await emit(pi, "tool_execution_end", {
      toolName: "bash",
      toolCallId: "call-bash-1",
      isError: false,
      result: { content: [{ type: "text", text: "ok" }] },
    });

    const entries = readAuditEntries(workdir);
    assert.equal(entries.length, 6);
    for (const entry of entries) {
      assert.equal(entry.sessionBaseCommit, head);
    }

    // Existing event shapes remain intact.
    assert.equal(entries[0].event, "tool_call");
    assert.equal(entries[0].tool, "bash");
    assert.equal(entries[0].toolCallId, "call-bash-1");
    assert.deepEqual(entries[0].input, { command: "git status" });
    assert.deepEqual(entries[1].input, {
      path: "README.md",
      offset: 1,
      limit: 10,
    });
    assert.deepEqual(entries[2].input, { path: "notes.txt" });
    assert.deepEqual(entries[3].input, { path: "notes.txt" });
    assert.deepEqual(entries[4].input, { pattern: "foo" });
    assert.equal(entries[5].event, "tool_execution_end");
    assert.equal(entries[5].tool, "bash");
    assert.equal(entries[5].toolCallId, "call-bash-1");
    assert.equal(entries[5].isError, false);
    assert.deepEqual(entries[5].result, {
      content: [{ type: "text", text: "ok" }],
    });
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("records null sessionBaseCommit when HEAD cannot be resolved", async () => {
  const workdir = createWorkdir({ withGit: false });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const pi = createFakePi();
    auditExtension(pi);

    await emit(pi, "tool_call", {
      toolName: "bash",
      toolCallId: "call-bash-2",
      input: { command: "echo hello" },
    });
    await emit(pi, "tool_execution_end", {
      toolName: "bash",
      toolCallId: "call-bash-2",
      isError: false,
      result: { content: [{ type: "text", text: "hello" }] },
    });

    const entries = readAuditEntries(workdir);
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      assert.equal(entry.sessionBaseCommit, null);
    }
    assert.equal(entries[0].event, "tool_call");
    assert.equal(entries[0].toolCallId, "call-bash-2");
    assert.equal(entries[1].event, "tool_execution_end");
    assert.equal(entries[1].toolCallId, "call-bash-2");
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("safety records guardrail_block events for every blocked call", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const pi = createFakePi();
    safetyExtension(pi);

    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workdir,
      encoding: "utf8",
    }).trim();

    const blockedWrite = await emit(pi, "tool_call", {
      toolName: "write",
      toolCallId: "call-safety-write",
      input: { path: ".pi/extensions/evil.ts", content: "evil" },
    });
    assert.equal(blockedWrite.block, true);

    const blockedGit = await emit(pi, "tool_call", {
      toolName: "bash",
      toolCallId: "call-safety-git",
      input: { command: "git commit -m 'should not happen'" },
    });
    assert.equal(blockedGit.block, true);

    const blockedBashProtected = await emit(pi, "tool_call", {
      toolName: "bash",
      toolCallId: "call-safety-bash",
      input: { command: "echo evil > .pi/extensions/evil.ts" },
    });
    assert.equal(blockedBashProtected.block, true);

    const allowedRead = await emit(pi, "tool_call", {
      toolName: "read",
      toolCallId: "call-safety-read",
      input: { path: "README.md" },
    });
    assert.equal(allowedRead, undefined);

    const blocks = guardrailBlockEntries(workdir);
    assert.equal(blocks.length, 3);

    assert.equal(blocks[0].tool, "write");
    assert.equal(blocks[0].toolCallId, "call-safety-write");
    assert.equal(blocks[0].guardrail, "safety");
    assert.equal(blocks[0].category, "protected_path");
    assert.deepEqual(blocks[0].input, { path: ".pi/extensions/evil.ts" });

    assert.equal(blocks[1].tool, "bash");
    assert.equal(blocks[1].toolCallId, "call-safety-git");
    assert.equal(blocks[1].guardrail, "safety");
    assert.equal(blocks[1].category, "git_write");
    assert.deepEqual(blocks[1].input, {
      command: "git commit -m 'should not happen'",
    });

    assert.equal(blocks[2].tool, "bash");
    assert.equal(blocks[2].toolCallId, "call-safety-bash");
    assert.equal(blocks[2].guardrail, "safety");
    assert.equal(blocks[2].category, "protected_path");
    assert.deepEqual(blocks[2].input, {
      command: "echo evil > .pi/extensions/evil.ts",
    });

    for (const block of blocks) {
      assert.equal(block.sessionBaseCommit, head);
      assert.ok(
        typeof block.reason === "string" && block.reason.length > 0,
        "guardrail_block entries must carry a human-facing reason",
      );
    }
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("plan mode records guardrail_block events for blocked calls", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  const promptsDir = path.join(workdir, ".pi", "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(promptsDir, "plan-instructions.md"),
    "Plan instructions.",
    "utf8",
  );
  fs.writeFileSync(
    path.join(promptsDir, "execute-instructions.md"),
    "Execute instructions.",
    "utf8",
  );

  try {
    const pi = createFakePi();
    planModeExtension(pi);

    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workdir,
      encoding: "utf8",
    }).trim();

    // Enable plan mode through the registered /plan command.
    const planCommand = pi.commands.get("plan");
    await planCommand.handler("audit the guardrails", createContext());
    assert.ok(!pi.state.activeTools.includes("write"));
    assert.ok(!pi.state.activeTools.includes("edit"));

    const blockedWrite = await emit(pi, "tool_call", {
      toolName: "write",
      toolCallId: "call-plan-write",
      input: { path: "notes.txt", content: "hello" },
    });
    assert.equal(blockedWrite.block, true);

    const blockedBash = await emit(pi, "tool_call", {
      toolName: "bash",
      toolCallId: "call-plan-bash",
      input: { command: "git commit -m 'should not happen'" },
    });
    assert.equal(blockedBash.block, true);

    const allowedBash = await emit(pi, "tool_call", {
      toolName: "bash",
      toolCallId: "call-plan-status",
      input: { command: "git status" },
    });
    assert.equal(allowedBash, undefined);

    const blocks = guardrailBlockEntries(workdir);
    assert.equal(blocks.length, 2);

    assert.equal(blocks[0].tool, "write");
    assert.equal(blocks[0].toolCallId, "call-plan-write");
    assert.equal(blocks[0].guardrail, "plan-mode");
    assert.equal(blocks[0].category, "plan_mode_tool");
    assert.deepEqual(blocks[0].input, { path: "notes.txt" });

    assert.equal(blocks[1].tool, "bash");
    assert.equal(blocks[1].toolCallId, "call-plan-bash");
    assert.equal(blocks[1].guardrail, "plan-mode");
    assert.equal(blocks[1].category, "plan_mode_command");
    assert.deepEqual(blocks[1].input, {
      command: "git commit -m 'should not happen'",
    });

    for (const block of blocks) {
      assert.equal(block.sessionBaseCommit, head);
      assert.ok(
        typeof block.reason === "string" && block.reason.length > 0,
        "guardrail_block entries must carry a human-facing reason",
      );
    }

    // Leaving plan mode restores tools and stops blocking.
    const executeCommand = pi.commands.get("execute");
    await executeCommand.handler("ship it", createContext());
    assert.ok(pi.state.activeTools.includes("write"));
    assert.ok(pi.state.activeTools.includes("edit"));

    const restoredWrite = await emit(pi, "tool_call", {
      toolName: "write",
      toolCallId: "call-plan-after-execute",
      input: { path: "notes.txt", content: "hello" },
    });
    assert.equal(restoredWrite, undefined);
    assert.equal(guardrailBlockEntries(workdir).length, 2);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("safety enforces Git read-only allowlist", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const pi = createFakePi();
    safetyExtension(pi);

    const allowed = [
      "git status",
      "git status --short",
      "git diff",
      "git diff --staged",
      "git log --oneline",
      "git show HEAD",
      "git rev-parse HEAD",
      "git ls-files",
      "git ls-tree HEAD",
      "git remote -v",
    ];

    const blocked = [
      "git",
      "git add file.txt",
      "git commit -m x",
      "git push origin main",
      "git reset --hard",
      "git update-ref HEAD abc123",
      "git update-index --add file.txt",
      "git commit-tree HEAD",
      "git symbolic-ref HEAD refs/heads/evil",
      "git remote",
      "git remote --verbose",
      "git remote add origin git@example.com:x/y.git",
      "git ls-remote",
      "git --no-pager log",
      "git status && git commit -m x",
    ];

    for (const command of allowed) {
      const result = await emit(pi, "tool_call", {
        toolName: "bash",
        toolCallId: `allowed-${command}`,
        input: { command },
      });

      assert.equal(result, undefined, `Expected allowed: ${command}`);
    }

    for (const command of blocked) {
      const result = await emit(pi, "tool_call", {
        toolName: "bash",
        toolCallId: `blocked-${command}`,
        input: { command },
      });

      assert.equal(result?.block, true, `Expected blocked: ${command}`);
    }
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("plan mode allows only standalone read-only Git commands", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  const promptsDir = path.join(workdir, ".pi", "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(promptsDir, "plan-instructions.md"),
    "Plan instructions.",
    "utf8",
  );
  fs.writeFileSync(
    path.join(promptsDir, "execute-instructions.md"),
    "Execute instructions.",
    "utf8",
  );

  try {
    const pi = createFakePi();
    planModeExtension(pi);

    const planCommand = pi.commands.get("plan");
    await planCommand.handler("guardrail test", createContext());

    const allowed = [
      "git status",
      "git diff --staged",
      "git log --oneline",
      "git show HEAD",
      "git rev-parse HEAD",
      "git ls-files",
      "git ls-tree HEAD",
      "git remote -v",
    ];

    const blocked = [
      "git",
      "git commit -m x",
      "git update-ref HEAD abc123",
      "git remote",
      "git remote --verbose",
      "git ls-remote",
      "git --no-pager log",
      "git status && echo oi",
      "git diff | cat",
      "git log; echo oi",
      "cat README.md && pwd",
    ];

    for (const command of allowed) {
      const result = await emit(pi, "tool_call", {
        toolName: "bash",
        toolCallId: `plan-allowed-${command}`,
        input: { command },
      });

      assert.equal(result, undefined, `Expected allowed in plan: ${command}`);
    }

    for (const command of blocked) {
      const result = await emit(pi, "tool_call", {
        toolName: "bash",
        toolCallId: `plan-blocked-${command}`,
        input: { command },
      });

      assert.equal(result?.block, true, `Expected blocked in plan: ${command}`);
    }
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("same runId across PLAN and EXECUTE phases", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  const promptsDir = path.join(workdir, ".pi", "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(promptsDir, "plan-instructions.md"),
    "Plan instructions.",
    "utf8",
  );
  fs.writeFileSync(
    path.join(promptsDir, "execute-instructions.md"),
    "Execute instructions.",
    "utf8",
  );

  try {
    const pi = createFakePi();
    planModeExtension(pi);

    const planCommand = pi.commands.get("plan");
    await planCommand.handler("same run test", createContext());

    let entries = readAuditEntries(workdir);
    const runStartEntries = entries.filter((e) => e.event === "run_start");
    assert.equal(runStartEntries.length, 1);
    const runId = runStartEntries[0].runId;
    assert.ok(runId);

    const executeCommand = pi.commands.get("execute");
    await executeCommand.handler("same run test", createContext());

    entries = readAuditEntries(workdir);
    const phaseChangeEntries = entries.filter(
      (e) => e.event === "phase_change",
    );
    assert.equal(phaseChangeEntries.length, 2);
    assert.equal(phaseChangeEntries[0].phase, "plan");
    assert.equal(phaseChangeEntries[1].phase, "execute");
    assert.equal(phaseChangeEntries[0].runId, runId);
    assert.equal(phaseChangeEntries[1].runId, runId);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("new /plan creates a different runId", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  const promptsDir = path.join(workdir, ".pi", "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(promptsDir, "plan-instructions.md"),
    "Plan instructions.",
    "utf8",
  );
  fs.writeFileSync(
    path.join(promptsDir, "execute-instructions.md"),
    "Execute instructions.",
    "utf8",
  );

  try {
    const pi = createFakePi();
    planModeExtension(pi);

    const planCommand = pi.commands.get("plan");

    await planCommand.handler("first task", createContext());
    let entries = readAuditEntries(workdir);
    let runStartEntries = entries.filter((e) => e.event === "run_start");
    assert.equal(runStartEntries.length, 1);
    const runId1 = runStartEntries[0].runId;
    assert.ok(runId1);

    await planCommand.handler("second task", createContext());
    entries = readAuditEntries(workdir);
    runStartEntries = entries.filter((e) => e.event === "run_start");
    assert.equal(runStartEntries.length, 2);
    const runId2 = runStartEntries[1].runId;
    assert.ok(runId2);
    assert.notEqual(runId1, runId2);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("multiple Runs in same Pi session", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  const promptsDir = path.join(workdir, ".pi", "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(promptsDir, "plan-instructions.md"),
    "Plan instructions.",
    "utf8",
  );
  fs.writeFileSync(
    path.join(promptsDir, "execute-instructions.md"),
    "Execute instructions.",
    "utf8",
  );

  try {
    const pi = createFakePi();
    planModeExtension(pi);

    const planCommand = pi.commands.get("plan");

    await planCommand.handler("task A", createContext());
    await planCommand.handler("task B", createContext());
    await planCommand.handler("task C", createContext());

    const entries = readAuditEntries(workdir);
    const runStartEntries = entries.filter((e) => e.event === "run_start");
    assert.equal(runStartEntries.length, 3);

    const runIds = runStartEntries.map((e) => e.runId);

    // Check that all have different runIds
    const uniqueRunIds = new Set(runIds);
    assert.equal(uniqueRunIds.size, 3);
    assert.notEqual(runIds[0], runIds[1]);
    assert.notEqual(runIds[1], runIds[2]);
    assert.notEqual(runIds[0], runIds[2]);

    assert.equal(runStartEntries[0].taskDescription, "task A");
    assert.equal(runStartEntries[1].taskDescription, "task B");
    assert.equal(runStartEntries[2].taskDescription, "task C");
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Tests for evaluator data model fixes (Issues 5-7, 9)
// These tests verify the evaluator handles edge cases correctly.
// ──────────────────────────────────────────────────────────────────────

test("consecutiveMaxErrors only counts consecutive tool_execution_end errors (not reset by other events)", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const auditDir = path.join(workdir, ".pi", "audit");
    fs.mkdirSync(auditDir, { recursive: true });

    // Guardrail block should NOT break the consecutive error streak
    const entries = [
      {
        event: "run_start",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        taskDescription: "test",
        sessionBaseCommit: "abc123",
      },
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:02Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "bash",
        toolCallId: "tc1",
        input: { command: "npm test" },
        sessionBaseCommit: "abc123",
      },
      {
        event: "tool_execution_end",
        timestamp: new Date("2024-01-01T00:00:03Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "bash",
        toolCallId: "tc1",
        isError: true,
        sessionBaseCommit: "abc123",
      },
      {
        event: "guardrail_block",
        timestamp: new Date("2024-01-01T00:00:03.1Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "write",
        toolCallId: "tc-blocked",
        guardrail: "plan-mode",
        category: "plan_mode_tool",
        reason: "blocked",
        sessionBaseCommit: "abc123",
      },
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:04Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "bash",
        toolCallId: "tc2",
        input: { command: "npm test" },
        sessionBaseCommit: "abc123",
      },
      {
        event: "tool_execution_end",
        timestamp: new Date("2024-01-01T00:00:05Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "bash",
        toolCallId: "tc2",
        isError: true,
        sessionBaseCommit: "abc123",
      },
      {
        event: "run_complete",
        timestamp: new Date("2024-01-01T00:00:06Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        sessionBaseCommit: "abc123",
      },
    ];

    fs.writeFileSync(
      path.join(auditDir, "tool-calls.jsonl"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
      "utf8",
    );

    const evals = runEvaluator(workdir);

    assert.equal(evals.length, 1);
    assert.equal(evals[0].runId, "test-run");
    assert.equal(
      evals[0].consecutiveMaxErrors,
      2,
      "consecutiveMaxErrors should be 2 (two consecutive tool errors, guardrail block should not break streak)",
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("legacy entries are grouped by sessionBaseCommit, not all merged under null", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const auditDir = path.join(workdir, ".pi", "audit");
    fs.mkdirSync(auditDir, { recursive: true });

    // Legacy entries: no runId, no schemaVersion (pre-V1)
    const entries = [
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
        tool: "bash",
        toolCallId: "tc1",
        input: { command: "echo hello" },
        sessionBaseCommit: "commit-a",
      },
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:01Z").toISOString(),
        tool: "bash",
        toolCallId: "tc2",
        input: { command: "echo world" },
        sessionBaseCommit: "commit-b",
      },
    ];

    fs.writeFileSync(
      path.join(auditDir, "tool-calls.jsonl"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
      "utf8",
    );

    const evals = runEvaluator(workdir);

    assert.equal(
      evals.length,
      2,
      "Should have 2 RunEval outputs (one per sessionBaseCommit)",
    );
    assert.equal(
      evals.filter((e) => e.baseCommit === "commit-a").length,
      1,
      "Should have a commit-a group",
    );
    assert.equal(
      evals.filter((e) => e.baseCommit === "commit-b").length,
      1,
      "Should have a commit-b group",
    );
    assert.equal(
      evals.some((e) => e.baseCommit === null),
      false,
      "Should not have a null-baseCommit group",
    );
    for (const runEval of evals) {
      assert.equal(runEval.runId, null, "Legacy RunEval runId should be null");
    }
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("PLAN phase boundaries use first phase_change(plan) to first phase_change(execute)", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const auditDir = path.join(workdir, ".pi", "audit");
    fs.mkdirSync(auditDir, { recursive: true });

    // Normal lifecycle: plan -> execute -> complete
    const entries = [
      {
        event: "run_start",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        taskDescription: "test",
        sessionBaseCommit: "abc123",
      },
      {
        event: "phase_change",
        timestamp: new Date("2024-01-01T00:00:01Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        phase: "plan",
        sessionBaseCommit: "abc123",
      },
      // Tool call during PLAN (after phase_change plan, before phase_change execute)
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:05Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "read",
        toolCallId: "tc-plan",
        input: { path: "README.md" },
        sessionBaseCommit: "abc123",
      },
      {
        event: "phase_change",
        timestamp: new Date("2024-01-01T00:00:10Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        phase: "execute",
        sessionBaseCommit: "abc123",
      },
      // Tool call during EXECUTE
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:15Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "write",
        toolCallId: "tc-execute",
        input: { path: "src/main.ts" },
        sessionBaseCommit: "abc123",
      },
      {
        event: "run_complete",
        timestamp: new Date("2024-01-01T00:00:20Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        sessionBaseCommit: "abc123",
      },
    ];

    fs.writeFileSync(
      path.join(auditDir, "tool-calls.jsonl"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
      "utf8",
    );

    const evals = runEvaluator(workdir);

    assert.equal(evals.length, 1);
    const run = evals[0];
    assert.equal(run.hasPlanPhase, true);
    assert.equal(run.hasExecutePhase, true);
    assert.equal(
      run.planPhaseDurationMs,
      9000,
      `planPhaseDurationMs should be 9000ms (00:00:10 execute - 00:00:01 plan), got ${run.planPhaseDurationMs}ms`,
    );
    assert.equal(
      run.executePhaseDurationMs,
      10000,
      `executePhaseDurationMs should be 10000ms (00:00:20 complete - 00:00:10 execute), got ${run.executePhaseDurationMs}ms`,
    );
    assert.equal(run.planPhaseToolCalls, 1);
    assert.equal(run.executePhaseToolCalls, 1);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("PLAN tool calls belong to PLAN when EXECUTE has not started", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  try {
    const auditDir = path.join(workdir, ".pi", "audit");
    fs.mkdirSync(auditDir, { recursive: true });

    // Run is in PLAN phase only, no execute yet
    const entries = [
      {
        event: "run_start",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        taskDescription: "test",
        sessionBaseCommit: "abc123",
      },
      {
        event: "phase_change",
        timestamp: new Date("2024-01-01T00:00:01Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        phase: "plan",
        sessionBaseCommit: "abc123",
      },
      // Multiple tool calls during PLAN, no execute phase
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:02Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "read",
        toolCallId: "tc1",
        input: { path: "README.md" },
        sessionBaseCommit: "abc123",
      },
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:03Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "read",
        toolCallId: "tc2",
        input: { path: "src/main.ts" },
        sessionBaseCommit: "abc123",
      },
      {
        event: "tool_call",
        timestamp: new Date("2024-01-01T00:00:04Z").toISOString(),
        runId: "test-run",
        schemaVersion: "1",
        tool: "read",
        toolCallId: "tc3",
        input: { path: "src/utils.ts" },
        sessionBaseCommit: "abc123",
      },
    ];

    fs.writeFileSync(
      path.join(auditDir, "tool-calls.jsonl"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
      "utf8",
    );

    const evals = runEvaluator(workdir);

    assert.equal(evals.length, 1);
    const run = evals[0];
    assert.equal(run.hasPlanPhase, true);
    assert.equal(run.hasExecutePhase, false);
    assert.equal(
      run.planPhaseToolCalls,
      3,
      "All 3 tool calls should be in PLAN phase when no EXECUTE exists",
    );
    assert.equal(run.planPhaseToolErrors, 0);
    assert.equal(
      run.executePhaseToolCalls,
      null,
      "executePhaseToolCalls should be null when EXECUTE has not started",
    );
    assert.equal(
      run.planPhaseDurationMs,
      null,
      "planPhaseDurationMs should be null when EXECUTE has not started",
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("testStatus uses the last completed matching invocation: FAIL then PASS → passed", async () => {
  const evals = evaluateAuditEntries([
    { event: "run_start", timestamp: "2024-01-01T00:00:00.000Z", runId: "status-run", schemaVersion: "1", taskDescription: "status", sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:01.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-1", input: { command: "npm test" }, sessionBaseCommit: "abc123" },
    { event: "tool_execution_end", timestamp: "2024-01-01T00:00:02.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-1", isError: true, sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:03.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-2", input: { command: "npm test" }, sessionBaseCommit: "abc123" },
    { event: "tool_execution_end", timestamp: "2024-01-01T00:00:04.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-2", isError: false, sessionBaseCommit: "abc123" },
    { event: "run_complete", timestamp: "2024-01-01T00:00:05.000Z", runId: "status-run", schemaVersion: "1", sessionBaseCommit: "abc123" },
  ]);

  assert.equal(evals.length, 1);
  assert.equal(evals[0].testStatus, "passed");
  assert.equal(evals[0].typecheckStatus, "not_run");
});

test("testStatus uses the last completed matching invocation: PASS then FAIL → failed", async () => {
  const evals = evaluateAuditEntries([
    { event: "run_start", timestamp: "2024-01-01T00:00:00.000Z", runId: "status-run", schemaVersion: "1", taskDescription: "status", sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:01.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-1", input: { command: "npm test" }, sessionBaseCommit: "abc123" },
    { event: "tool_execution_end", timestamp: "2024-01-01T00:00:02.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-1", isError: false, sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:03.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-2", input: { command: "npm test" }, sessionBaseCommit: "abc123" },
    { event: "tool_execution_end", timestamp: "2024-01-01T00:00:04.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-2", isError: true, sessionBaseCommit: "abc123" },
    { event: "run_complete", timestamp: "2024-01-01T00:00:05.000Z", runId: "status-run", schemaVersion: "1", sessionBaseCommit: "abc123" },
  ]);

  assert.equal(evals.length, 1);
  assert.equal(evals[0].testStatus, "failed");
  assert.equal(evals[0].typecheckStatus, "not_run");
});

test("typecheckStatus uses the last completed matching invocation: FAIL then PASS → passed", async () => {
  const evals = evaluateAuditEntries([
    { event: "run_start", timestamp: "2024-01-01T00:00:00.000Z", runId: "status-run", schemaVersion: "1", taskDescription: "status", sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:01.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-1", input: { command: "npx tsc --noEmit" }, sessionBaseCommit: "abc123" },
    { event: "tool_execution_end", timestamp: "2024-01-01T00:00:02.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-1", isError: true, sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:03.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-2", input: { command: "npx tsc --noEmit" }, sessionBaseCommit: "abc123" },
    { event: "tool_execution_end", timestamp: "2024-01-01T00:00:04.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-2", isError: false, sessionBaseCommit: "abc123" },
    { event: "run_complete", timestamp: "2024-01-01T00:00:05.000Z", runId: "status-run", schemaVersion: "1", sessionBaseCommit: "abc123" },
  ]);

  assert.equal(evals.length, 1);
  assert.equal(evals[0].typecheckStatus, "passed");
  assert.equal(evals[0].testStatus, "not_run");
});

test("typecheckStatus uses the last completed matching invocation: PASS then FAIL → failed", async () => {
  const evals = evaluateAuditEntries([
    { event: "run_start", timestamp: "2024-01-01T00:00:00.000Z", runId: "status-run", schemaVersion: "1", taskDescription: "status", sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:01.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-1", input: { command: "npx tsc --noEmit" }, sessionBaseCommit: "abc123" },
    { event: "tool_execution_end", timestamp: "2024-01-01T00:00:02.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-1", isError: false, sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:03.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-2", input: { command: "npx tsc --noEmit" }, sessionBaseCommit: "abc123" },
    { event: "tool_execution_end", timestamp: "2024-01-01T00:00:04.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-2", isError: true, sessionBaseCommit: "abc123" },
    { event: "run_complete", timestamp: "2024-01-01T00:00:05.000Z", runId: "status-run", schemaVersion: "1", sessionBaseCommit: "abc123" },
  ]);

  assert.equal(evals.length, 1);
  assert.equal(evals[0].typecheckStatus, "failed");
  assert.equal(evals[0].testStatus, "not_run");
});

test("tool calls without matching tool_execution_end do not determine final status", async () => {
  const evals = evaluateAuditEntries([
    { event: "run_start", timestamp: "2024-01-01T00:00:00.000Z", runId: "status-run", schemaVersion: "1", taskDescription: "status", sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:01.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "test-unmatched", input: { command: "npm test" }, sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:02.000Z", runId: "status-run", schemaVersion: "1", tool: "bash", toolCallId: "typecheck-unmatched", input: { command: "npx tsc --noEmit" }, sessionBaseCommit: "abc123" },
    { event: "run_complete", timestamp: "2024-01-01T00:00:03.000Z", runId: "status-run", schemaVersion: "1", sessionBaseCommit: "abc123" },
  ]);

  assert.equal(evals.length, 1);
  assert.equal(evals[0].testStatus, "not_run");
  assert.equal(evals[0].typecheckStatus, "not_run");
});

test("completed V1 Run timing uses run_start and run_complete, not min/max events", async () => {
  const evals = evaluateAuditEntries([
    { event: "run_start", timestamp: "2024-01-01T00:00:10.000Z", runId: "timing-run", schemaVersion: "1", taskDescription: "timing", sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:05.000Z", runId: "timing-run", schemaVersion: "1", tool: "read", toolCallId: "read-early", input: { path: "README.md" }, sessionBaseCommit: "abc123" },
    { event: "phase_change", timestamp: "2024-01-01T00:00:11.000Z", runId: "timing-run", schemaVersion: "1", phase: "plan", sessionBaseCommit: "abc123" },
    { event: "run_complete", timestamp: "2024-01-01T00:00:20.000Z", runId: "timing-run", schemaVersion: "1", sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:30.000Z", runId: "timing-run", schemaVersion: "1", tool: "read", toolCallId: "read-late", input: { path: "src/main.ts" }, sessionBaseCommit: "abc123" },
  ]);

  assert.equal(evals.length, 1);
  assert.equal(evals[0].status, "completed");
  assert.equal(evals[0].runStart, "2024-01-01T00:00:10.000Z");
  assert.equal(evals[0].runEnd, "2024-01-01T00:00:20.000Z");
  assert.equal(evals[0].runDurationMs, 10000);
});

test("active V1 Run timing uses run_start and latest event timestamp", async () => {
  const evals = evaluateAuditEntries([
    { event: "tool_call", timestamp: "2024-01-01T00:00:05.000Z", runId: "timing-active", schemaVersion: "1", tool: "read", toolCallId: "read-early", input: { path: "README.md" }, sessionBaseCommit: "abc123" },
    { event: "run_start", timestamp: "2024-01-01T00:00:10.000Z", runId: "timing-active", schemaVersion: "1", taskDescription: "timing", sessionBaseCommit: "abc123" },
    { event: "phase_change", timestamp: "2024-01-01T00:00:11.000Z", runId: "timing-active", schemaVersion: "1", phase: "plan", sessionBaseCommit: "abc123" },
    { event: "tool_call", timestamp: "2024-01-01T00:00:30.000Z", runId: "timing-active", schemaVersion: "1", tool: "read", toolCallId: "read-late", input: { path: "src/main.ts" }, sessionBaseCommit: "abc123" },
  ]);

  assert.equal(evals.length, 1);
  assert.equal(evals[0].status, "active");
  assert.equal(evals[0].runStart, "2024-01-01T00:00:10.000Z");
  assert.equal(evals[0].runEnd, "2024-01-01T00:00:30.000Z");
  assert.equal(evals[0].runDurationMs, 20000);
});

test("direct /execute creates a new Run with run_start before phase_change(execute)", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  const promptsDir = path.join(workdir, ".pi", "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(promptsDir, "execute-instructions.md"),
    "Execute instructions.",
    "utf8",
  );

  try {
    const pi = createFakePi();
    planModeExtension(pi);

    const executeCommand = pi.commands.get("execute");
    await executeCommand.handler("direct execute task", createContext());

    const entries = readAuditEntries(workdir);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].event, "run_start");
    assert.equal(entries[0].taskDescription, "direct execute task");
    assert.equal(entries[1].event, "phase_change");
    assert.equal(entries[1].phase, "execute");
    assert.equal(entries[0].runId, entries[1].runId);
    assert.ok(entries[0].runId);

    const state = JSON.parse(
      fs.readFileSync(path.join(workdir, ".pi", "audit", "run.json"), "utf8"),
    );
    assert.equal(state.runId, entries[0].runId);
    assert.equal(state.task, "direct execute task");
    assert.equal(state.currentPhase, "execute");
    assert.equal(state.completedAt, null);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test("/execute after a completed Run creates a new Run (not reopening)", async () => {
  const workdir = createWorkdir({ withGit: true });
  const previousCwd = process.cwd();
  process.chdir(workdir);

  const promptsDir = path.join(workdir, ".pi", "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(promptsDir, "execute-instructions.md"),
    "Execute instructions.",
    "utf8",
  );

  try {
    const pi = createFakePi();
    planModeExtension(pi);
    auditExtension(pi);

    const executeCommand = pi.commands.get("execute");

    // Complete Run A through the real audit extension's agent_settled handler.
    await executeCommand.handler("first task", createContext());
    await emit(pi, "agent_settled");

    const entriesAfterFirst = readAuditEntries(workdir);
    assert.equal(entriesAfterFirst.length, 3);
    const firstRunId = entriesAfterFirst[0].runId;
    assert.equal(entriesAfterFirst[0].event, "run_start");
    assert.equal(entriesAfterFirst[1].event, "phase_change");
    assert.equal(entriesAfterFirst[2].event, "run_complete");
    assert.equal(entriesAfterFirst[2].runId, firstRunId);

    // A new /execute must create a new Run rather than reopen the completed one.
    await executeCommand.handler("second task", createContext());

    const entries = readAuditEntries(workdir);
    assert.equal(entries.length, 5);

    const runStarts = entries.filter((e) => e.event === "run_start");
    const phaseChanges = entries.filter((e) => e.event === "phase_change");
    const runCompletes = entries.filter((e) => e.event === "run_complete");

    assert.equal(runStarts.length, 2);
    assert.equal(phaseChanges.length, 2);
    assert.equal(runCompletes.length, 1);

    const secondRunStart = runStarts[1];
    assert.notEqual(secondRunStart.runId, firstRunId);
    assert.equal(secondRunStart.taskDescription, "second task");
    assert.equal(phaseChanges[1].runId, secondRunStart.runId);
    assert.equal(phaseChanges[1].phase, "execute");

    const state = JSON.parse(
      fs.readFileSync(path.join(workdir, ".pi", "audit", "run.json"), "utf8"),
    );
    assert.equal(state.runId, secondRunStart.runId);
    assert.equal(state.task, "second task");
    assert.equal(state.currentPhase, "execute");
    assert.equal(state.completedAt, null);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});
