# Protected File Patches for Task 003

Apply these changes manually to the protected files.

## 1. .pi/extensions/plan-mode.ts

### Add imports at top of file:

```typescript
import { randomUUID } from "node:crypto";
import { writeActiveRunState, appendLifecycleEvent, readActiveRunState } from "../lib/audit.ts";
```

### In the `/plan` command handler, add BEFORE `enablePlanMode()`:

```typescript
// Lifecycle telemetry
const runId = randomUUID();
writeActiveRunState({
  runId,
  task: args.trim(),
  currentPhase: "plan",
  startedAt: new Date().toISOString(),
  completedAt: null,
});
appendLifecycleEvent("run_start", runId, { taskDescription: args.trim() });
appendLifecycleEvent("phase_change", runId, { phase: "plan" });
```

### In the `/execute` command handler, add BEFORE `disablePlanMode()`:

```typescript
// Lifecycle telemetry
const state = readActiveRunState();
// Only reuse runId if the existing Run is still active (not completed)
// Otherwise, create a new runId (direct /execute or /execute after a completed Run)
const activeState = state && !state.completedAt ? state : null;
const runId = activeState?.runId ?? randomUUID();
const runTask = activeState?.task ?? task;
writeActiveRunState({
  runId,
  task: runTask,
  currentPhase: "execute",
  startedAt: activeState?.startedAt ?? new Date().toISOString(),
  completedAt: null,
});

// If this is a new Run (no activeState), emit run_start before phase_change(execute)
// This ensures the Run has proper lifecycle: run_start → phase_change(execute)
if (!activeState) {
  appendLifecycleEvent("run_start", runId, { taskDescription: runTask });
}
appendLifecycleEvent("phase_change", runId, { phase: "execute" });
```

## 2. .pi/extensions/audit.ts

### Add import at top of file:

```typescript
import { readActiveRunState, appendLifecycleEvent, writeActiveRunState } from "../lib/audit.ts";
```

### Add handler AFTER the existing `tool_execution_end` handler:

```typescript
// Lifecycle telemetry - mark Run complete when agent settles in execute phase
pi.on("agent_settled", async () => {
  const state = readActiveRunState();
  if (state && state.currentPhase === "execute" && !state.completedAt) {
    writeActiveRunState({ ...state, completedAt: new Date().toISOString() });
    appendLifecycleEvent("run_complete", state.runId);
  }
});
```

## 3. .pi/lib/audit.ts

Already updated as part of writable changes. No patches needed.
