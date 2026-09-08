import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { recordGuardrailBlock } from "../lib/audit.ts";

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
  pi.on("tool_call", async (event, ctx) => {
    //
    // Protect .pi/extensions from write/edit tools
    //

    if (isToolCallEventType("write", event)) {
      if (isProtectedPath(event.input.path)) {
        ctx.ui.notify(
          `Blocked write to protected path: ${event.input.path}`,
          "warning",
        );

        recordGuardrailBlock({
          guardrail: "safety",
          category: "protected_path",
          reason:
            ".pi/extensions is protected. The agent may read safety extensions but may not modify them.",
          tool: event.toolName,
          toolCallId: event.toolCallId,
          input: { path: event.input.path },
        });

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

        recordGuardrailBlock({
          guardrail: "safety",
          category: "protected_path",
          reason:
            ".pi/extensions is protected. The agent may read safety extensions but may not modify them.",
          tool: event.toolName,
          toolCallId: event.toolCallId,
          input: { path: event.input.path },
        });

        return {
          block: true,
          reason:
            ".pi/extensions is protected. The agent may read safety extensions but may not modify them.",
        };
      }
    }

    //
    // Global bash guardrails
    //

    if (isToolCallEventType("bash", event)) {
      const command = event.input.command;

      if (containsBlockedGitCommand(command)) {
        ctx.ui.notify(`Blocked Git write operation:\n${command}`, "warning");

        recordGuardrailBlock({
          guardrail: "safety",
          category: "git_write",
          reason:
            "Git write/history operations are human-controlled. " +
            "Use read-only commands such as git status, git diff, git log, or git show.",
          tool: event.toolName,
          toolCallId: event.toolCallId,
          input: { command },
        });

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

        recordGuardrailBlock({
          guardrail: "safety",
          category: "protected_path",
          reason:
            ".pi/extensions is protected from agent modifications, including modifications performed through bash.",
          tool: event.toolName,
          toolCallId: event.toolCallId,
          input: { command },
        });

        return {
          block: true,
          reason:
            ".pi/extensions is protected from agent modifications, including modifications performed through bash.",
        };
      }
    }
  });
}
