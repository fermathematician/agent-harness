import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { recordGuardrailBlock } from "../lib/audit.ts";

const PROTECTED_PATH = ".pi/extensions";

const ALLOWED_GIT_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "show",
  "rev-parse",
  "ls-files",
  "ls-tree",
]);

function containsDisallowedGitCommand(command: string): boolean {
  const gitInvocation = /\bgit(?:\s+([a-zA-Z0-9_-]+))?/gi;
  let match;

  while ((match = gitInvocation.exec(command)) !== null) {
    const subcommand = match[1];

    if (!subcommand) {
      return true;
    }

    if (subcommand.toLowerCase() === "remote") {
      const afterSubcommand = command.slice(match.index + match[0].length);

      if (/^\s+-v(?=\s*(?:$|&&|\|\||;|\|))/i.test(afterSubcommand)) {
        continue;
      }

      return true;
    }

    if (ALLOWED_GIT_SUBCOMMANDS.has(subcommand.toLowerCase())) {
      continue;
    }

    return true;
  }

  return false;
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

      if (containsDisallowedGitCommand(command)) {
        ctx.ui.notify(`Blocked Git operation:\n${command}`, "warning");

        recordGuardrailBlock({
          guardrail: "safety",
          category: "git_write",
          reason:
            "Git operations are human-controlled except for explicitly allowed read-only commands.",
          tool: event.toolName,
          toolCallId: event.toolCallId,
          input: { command },
        });

        return {
          block: true,
          reason:
            "Git operations are human-controlled except for explicitly allowed read-only commands.",
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
