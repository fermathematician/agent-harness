import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

const PROTECTED_PATH = ".pi/extensions";

const BLOCKED_GIT_COMMANDS: RegExp[] = [
  /\bgit\s+add\b/i,
  /\bgit\s+commit\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+pull\b/i,
  /\bgit\s+merge\b/i,
  /\bgit\s+rebase\b/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+revert\b/i,
  /\bgit\s+cherry-pick\b/i,
  /\bgit\s+stash\b/i,
  /\bgit\s+checkout\b/i,
  /\bgit\s+switch\b/i,
  /\bgit\s+branch\b/i,
  /\bgit\s+tag\b/i,
  /\bgit\s+config\b/i,
  /\bgit\s+remote\s+(add|remove|rename|set-url)\b/i,
];

const PLAN_PROMPT_PATH = ".pi/prompts/plan-instructions.md";
const EXECUTE_PROMPT_PATH = ".pi/prompts/execute-instructions.md";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls"];
const PLAN_MODE_DISABLED_TOOLS = new Set(["edit", "write"]);

const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /\bshred\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish)/i,
  /\bpip\s+(install|uninstall)/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
  /\bbrew\s+(install|uninstall|upgrade)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)/i,
  /\bservice\s+\S+\s+(start|stop|restart)/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
  /^\s*cat\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*less\b/,
  /^\s*more\b/,
  /^\s*grep\b/,
  /^\s*find\b/,
  /^\s*ls\b/,
  /^\s*pwd\b/,
  /^\s*echo\b/,
  /^\s*printf\b/,
  /^\s*wc\b/,
  /^\s*sort\b/,
  /^\s*uniq\b/,
  /^\s*diff\b/,
  /^\s*file\b/,
  /^\s*stat\b/,
  /^\s*du\b/,
  /^\s*df\b/,
  /^\s*tree\b/,
  /^\s*which\b/,
  /^\s*whereis\b/,
  /^\s*type\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
  /^\s*uname\b/,
  /^\s*whoami\b/,
  /^\s*id\b/,
  /^\s*date\b/,
  /^\s*cal\b/,
  /^\s*uptime\b/,
  /^\s*ps\b/,
  /^\s*top\b/,
  /^\s*htop\b/,
  /^\s*free\b/,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
  /^\s*git\s+ls-/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
  /^\s*yarn\s+(list|info|why|audit)/i,
  /^\s*node\s+--version/i,
  /^\s*python\s+--version/i,
  /^\s*curl\s/i,
  /^\s*wget\s+-O\s*-/i,
  /^\s*jq\b/,
  /^\s*sed\s+-n/i,
  /^\s*awk\b/,
  /^\s*rg\b/,
  /^\s*fd\b/,
  /^\s*bat\b/,
  /^\s*eza\b/,
];

function isSafeCommand(command: string): boolean {
  const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
  const isSafe = SAFE_PATTERNS.some((p) => p.test(command));

  return !isDestructive && isSafe;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isProtectedPath(path: string): boolean {
  const normalized = normalizePath(path);

  return (
    normalized === PROTECTED_PATH ||
    normalized.startsWith(`${PROTECTED_PATH}/`) ||
    normalized.includes(`/${PROTECTED_PATH}/`)
  );
}

function containsBlockedGitCommand(command: string): boolean {
  return BLOCKED_GIT_COMMANDS.some((pattern) => pattern.test(command));
}

function bashTouchesProtectedPath(command: string): boolean {
  if (!command.includes(PROTECTED_PATH)) {
    return false;
  }

  const writePatterns = [
    /\brm\b/i,
    /\bmv\b/i,
    /\bcp\b/i,
    /\btouch\b/i,
    /\bmkdir\b/i,
    /\bsed\b/i,
    /\bperl\b/i,
    /\bpython(?:3)?\b/i,
    /\bnode\b/i,
    /\btee\b/i,
    /\btruncate\b/i,
    /\bchmod\b/i,
    /\bchown\b/i,
    />/,
    />>/,
  ];

  return writePatterns.some((pattern) => pattern.test(command));
}

export default function safety(pi: ExtensionAPI) {
  let planModeEnabled = false;
  let toolsBeforePlanMode: string[] | undefined;

  function enablePlanMode() {
    if (toolsBeforePlanMode === undefined) {
      toolsBeforePlanMode = pi.getActiveTools();
    }

    const tools = [
      ...toolsBeforePlanMode.filter(
        (name) => !PLAN_MODE_DISABLED_TOOLS.has(name),
      ),
      ...PLAN_MODE_TOOLS,
    ];

    pi.setActiveTools([...new Set(tools)]);
    planModeEnabled = true;
  }

  function disablePlanMode() {
    if (toolsBeforePlanMode !== undefined) {
      pi.setActiveTools(toolsBeforePlanMode);
      toolsBeforePlanMode = undefined;
    }

    planModeEnabled = false;
  }

  pi.registerCommand("plan", {
    description: "Plan a task in protected read-only mode",

    handler: async (args, ctx) => {
      const task = args.trim();

      if (!task) {
        ctx.ui.notify("Usage: /plan <task>", "warning");
        return;
      }

      const promptPath = path.resolve(PLAN_PROMPT_PATH);

      if (!fs.existsSync(promptPath)) {
        ctx.ui.notify(
          `Plan instructions not found: ${PLAN_PROMPT_PATH}`,
          "warning",
        );
        return;
      }

      const instructions = fs.readFileSync(promptPath, "utf8");

      enablePlanMode();

      ctx.ui.setStatus("plan-mode", "⏸ plan");
      ctx.ui.notify(
        "Plan mode enabled. Write/edit tools are disabled.",
        "info",
      );

      pi.sendUserMessage(`${instructions}\n\nTask:\n${task}`, {
        deliverAs: "followUp",
      });
    },
  });

  pi.registerCommand("execute", {
    description: "Execute a task with normal development tools",

    handler: async (args, ctx) => {
      const task = args.trim();

      if (!task) {
        ctx.ui.notify("Usage: /execute <task>", "warning");
        return;
      }

      const promptPath = path.resolve(EXECUTE_PROMPT_PATH);

      if (!fs.existsSync(promptPath)) {
        ctx.ui.notify(
          `Execute instructions not found: ${EXECUTE_PROMPT_PATH}`,
          "warning",
        );
        return;
      }

      const instructions = fs.readFileSync(promptPath, "utf8");

      disablePlanMode();

      ctx.ui.setStatus("plan-mode", undefined);

      ctx.ui.notify("Plan mode disabled. Development tools restored.", "info");

      pi.sendUserMessage(`${instructions}\n\nTask:\n${task}`, {
        deliverAs: "followUp",
      });
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (
      planModeEnabled &&
      (isToolCallEventType("write", event) ||
        isToolCallEventType("edit", event))
    ) {
      ctx.ui.notify(`Blocked ${event.toolName} in plan mode.`, "warning");

      return {
        block: true,
        reason: "Plan mode is read-only. File modifications are not permitted.",
      };
    }
    //
    // Protect .pi/extensions from write/edit tools
    //
    if (isToolCallEventType("write", event)) {
      if (isProtectedPath(event.input.path)) {
        ctx.ui.notify(
          `Blocked write to protected path: ${event.input.path}`,
          "warning",
        );

        return {
          block: true,
          reason:
            ".pi/extensions is protected. The agent may read safety extensions but may not modify them.",
        };
      }
    }

    if (isToolCallEventType("edit", event)) {
      if (isProtectedPath(event.input.path)) {
        ctx.ui.notify(
          `Blocked edit to protected path: ${event.input.path}`,
          "warning",
        );

        return {
          block: true,
          reason:
            ".pi/extensions is protected. The agent may read safety extensions but may not modify them.",
        };
      }
    }

    //
    // Bash guardrails
    //
    if (isToolCallEventType("bash", event)) {
      const command = event.input.command;

      if (planModeEnabled && !isSafeCommand(command)) {
        ctx.ui.notify(`Blocked command in plan mode:\n${command}`, "warning");

        return {
          block: true,
          reason:
            "Plan mode is read-only. Only allowlisted inspection commands are permitted.",
        };
      }

      if (containsBlockedGitCommand(command)) {
        ctx.ui.notify(`Blocked Git write operation:\n${command}`, "warning");

        return {
          block: true,
          reason:
            "Git write/history operations are human-controlled. " +
            "Use read-only commands such as git status, git diff, git log, or git show.",
        };
      }

      if (bashTouchesProtectedPath(command)) {
        ctx.ui.notify(
          `Blocked modification of protected path:\n${command}`,
          "warning",
        );

        return {
          block: true,
          reason:
            ".pi/extensions is protected from agent modifications, including modifications performed through bash.",
        };
      }
    }
  });
}
