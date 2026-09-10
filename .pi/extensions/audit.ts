import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import {
  appendAudit,
  readActiveRunState,
  appendLifecycleEvent,
  writeActiveRunState,
} from "../lib/audit.ts";

export default function audit(pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    const base = {
      event: "tool_call",
      timestamp: new Date().toISOString(),
      tool: event.toolName,
      toolCallId: event.toolCallId,
    };

    if (isToolCallEventType("bash", event)) {
      appendAudit({
        ...base,
        input: {
          command: event.input.command,
        },
      });
      return;
    }

    if (isToolCallEventType("read", event)) {
      appendAudit({
        ...base,
        input: {
          path: event.input.path,
          offset: event.input.offset,
          limit: event.input.limit,
        },
      });
      return;
    }

    if (isToolCallEventType("write", event)) {
      appendAudit({
        ...base,
        input: {
          path: event.input.path,
        },
      });
      return;
    }

    if (isToolCallEventType("edit", event)) {
      appendAudit({
        ...base,
        input: {
          path: event.input.path,
        },
      });
      return;
    }

    appendAudit({
      ...base,
      input: event.input,
    });
  });

  pi.on("tool_execution_end", async (event) => {
    appendAudit({
      event: "tool_execution_end",
      timestamp: new Date().toISOString(),
      tool: event.toolName,
      toolCallId: event.toolCallId,
      isError: event.isError,
      result: event.result,
    });
  });

  pi.on("agent_settled", async () => {
    const state = readActiveRunState();

    if (state && state.currentPhase === "execute" && !state.completedAt) {
      writeActiveRunState({
        ...state,
        completedAt: new Date().toISOString(),
      });

      appendLifecycleEvent("run_complete", state.runId);
    }
  });
}
