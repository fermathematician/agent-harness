"use strict";

/**
 * Tests for the audit extension (.pi/extensions/audit.ts).
 *
 * The extension is TypeScript, while the repository package.json is
 * "commonjs", so Node cannot load the original file as an ES module.
 * Node also refuses type stripping for files under node_modules.
 * The tests therefore copy the extension into a scratch module directory
 * inside the repository (but outside node_modules, so its imports still
 * resolve) with its own "type": "module" package.json and load that copy
 * with a dynamic import. The loaded module is driven with a fake
 * ExtensionAPI.
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
const EXTENSION_TS = path.join(REPO_ROOT, ".pi", "extensions", "audit.ts");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "audit-test");

let auditExtension;

test.before(async () => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  const moduleDir = path.join(CACHE_DIR, `run-${process.pid}-${Date.now()}`);
  fs.mkdirSync(moduleDir, { recursive: true });

  fs.copyFileSync(EXTENSION_TS, path.join(moduleDir, "audit.ts"));
  fs.writeFileSync(
    path.join(moduleDir, "package.json"),
    JSON.stringify({ type: "module" }),
    "utf8",
  );

  const mod = await import(pathToFileURL(path.join(moduleDir, "audit.ts")).href);
  auditExtension = mod.default;
});

test.after(() => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
});

function createFakePi() {
  const handlers = new Map();
  return {
    handlers,
    on(event, handler) {
      const list = handlers.get(event);
      if (list) {
        list.push(handler);
      } else {
        handlers.set(event, [handler]);
      }
    },
  };
}

async function emit(pi, eventName, event) {
  for (const handler of pi.handlers.get(eventName) ?? []) {
    await handler(event, {});
  }
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
