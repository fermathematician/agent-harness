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
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "audit-test");

let auditExtension;
let safetyExtension;
let planModeExtension;

test.before(async () => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  const moduleDir = path.join(CACHE_DIR, `run-${process.pid}-${Date.now()}`);
  const extensionsDir = path.join(moduleDir, ".pi", "extensions");
  const libDir = path.join(moduleDir, ".pi", "lib");
  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });

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
    assert.deepEqual(entries[1].input, { path: "README.md", offset: 1, limit: 10 });
    assert.deepEqual(entries[2].input, { path: "notes.txt" });
    assert.deepEqual(entries[3].input, { path: "notes.txt" });
    assert.deepEqual(entries[4].input, { pattern: "foo" });
    assert.equal(entries[5].event, "tool_execution_end");
    assert.equal(entries[5].tool, "bash");
    assert.equal(entries[5].toolCallId, "call-bash-1");
    assert.equal(entries[5].isError, false);
    assert.deepEqual(entries[5].result, { content: [{ type: "text", text: "ok" }] });
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
