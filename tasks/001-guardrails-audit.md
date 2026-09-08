/plan We want to improve the harness so blocked actions by guardrails become explicit audit evidence and can later be evaluated as safety metrics.

Currently:

- audit.ts records tool calls and tool execution results.
- safety.ts and plan-mode.ts can block tool calls.
- session-eval.ts derives session metrics from the audit log.
- blocked attempts are not reliably measurable because a blocked tool call may simply lack a tool_execution_end event.

Investigate the current implementation and propose a clean architecture for recording guardrail decisions such as:

- whether an attempted action was blocked;
- which guardrail blocked it;
- a stable machine-readable reason/category;
- the sessionBaseCommit associated with the attempt.

The design should allow session-eval.ts to later derive metrics such as blockedAttempts, gitMutationAttempts, and protectedPathAttempts.

Important constraints:

- Keep audit facts separate from evaluation/interpretation.
- Avoid unnecessary coupling between extensions.
- Preserve the current human-controlled Git workflow.
- Do not redesign unrelated parts of the harness.
- `.pi/extensions/` is protected by the harness. You may read those files, but you cannot modify them, even in execute mode.
- If the proposed solution requires changes inside `.pi/extensions/`, identify the exact changes needed and stop at the plan. I will apply protected-file edits manually.

Do not implement anything. Investigate the repository, compare reasonable approaches, recommend one, and identify exactly which files would need to change.
