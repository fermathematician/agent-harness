import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

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

export default function planMode(pi: ExtensionAPI) {
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
    }
  });
}
