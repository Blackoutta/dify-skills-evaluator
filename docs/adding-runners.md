# Adding Runners

This repo is designed so the execution layer can change without rewriting the evaluator core.

A runner is the component that receives a validated test case plus runtime context, executes the target skill, and returns a normalized `RunnerExecutionResult`. Right now the only implementation is `CodexRunner`, but the structure already supports adding more.

## The Core Contract

The runner abstraction lives in `src/server/runners/agent-runner.ts`:

```ts
export interface AgentRunner {
  kind: string;
  run(input: RunnerExecutionInput): Promise<RunnerExecutionResult>;
}
```

The important part is not the interface size. It is the shape of the input and output.

`RunnerExecutionInput` includes:

- `skillPath`: absolute path to the skill under test
- `workspaceRoot`: current repo root used as the runner working context
- `testCase`: the fully validated `EvaluationTestCase`
- `env`: environment variables prepared by the orchestrator
- `artifactBindings`: resolved local files available to the runner
- `workingDirectory`: per-run output directory under `runs/<runId>/`
- `timeoutMs`: max execution time
- `onStdout` and `onStderr`: callbacks for streaming logs into run artifacts

`RunnerExecutionResult` must report:

- `runnerKind`
- `startedAt`
- `endedAt`
- `durationMs`
- `exitCode`
- `status`: `completed`, `failed`, or `timed_out`
- `stdoutPath`
- `stderrPath`
- optional `usage` data for token-based scoring

## What The Current Codex Runner Does

`src/server/runners/codex-runner.ts` is the reference implementation.

It currently:

- builds a prompt from the test case, skill path, app aliases, and artifact bindings
- launches `codex exec --dangerously-bypass-approvals-and-sandbox --json`
- runs in the per-run working directory
- forwards orchestrator-provided environment variables into the child process
- streams stdout and stderr back through callbacks
- parses usage data from JSON lines in stdout
- converts process exit or timeout into a normalized runner status

If you add another runner, match this behavior closely unless you have a good reason not to.

## Where A New Runner Must Be Wired In

Adding a runner is more than creating one class. Today you also need to wire it into the runtime and input surfaces.

### 1. Create the implementation

Add a new file under `src/server/runners/`, such as:

```text
src/server/runners/my-runner.ts
```

Implement `AgentRunner` and return a proper `RunnerExecutionResult`.

### 2. Expose it from runtime

`src/server/runtime.ts` currently creates a single `CodexRunner` instance and injects it into `EvaluatorOrchestrator`.

To support another runner, update runtime selection so the orchestrator receives the correct implementation for the requested `runnerKind`.

### 3. Expand the accepted input type

`src/server/types/contracts.ts` currently restricts `StartEvaluationInput["runnerKind"]` to `"codex"`.

That means a new runner also requires:

- extending the allowed `runnerKind` union
- keeping validation aligned with the new values

### 4. Expose it in the UI

`app/components/run-console.tsx` contains the `availableRunners` list and the runner selector UI.

If users should be able to launch the new runner from the app, update that list and any runner-specific descriptions there.

## Environment And Proxy Expectations

Runners do not receive raw Dify secrets directly. They receive proxy-based app URLs through orchestrator-built environment variables.

Today the orchestrator injects:

- `EVAL_RUN_ID`
- `DIFY_APP_USER`
- `NO_PROXY`
- `no_proxy`
- one `DIFY_APP_BASE_URL_<APP_ALIAS>` entry per bound app

Each `DIFY_APP_BASE_URL_<APP_ALIAS>` points to the local proxy route for that run, not to the real upstream Dify URL.

That design matters:

- it keeps trace capture centralized
- it lets the evaluator score what the skill actually did
- it keeps binding secrets in the server-side secret store instead of the runner environment

A new runner should preserve this model rather than bypassing the proxy.

## Logging, Timeouts, And Usage

To integrate cleanly with the rest of the evaluator, a runner should:

- stream stdout to `runner-output.log`
- stream stderr to `runner-error.log`
- respect `timeoutMs`
- mark timed-out runs as `timed_out`
- capture usage data when the underlying agent/runtime exposes token counts

Usage is optional in the contract, but if you omit it, `tokenEfficiencyScore` cannot be calculated.

## Recommended Implementation Checklist

1. Create a new runner file under `src/server/runners/`.
2. Implement `AgentRunner`.
3. Accept `RunnerExecutionInput` without inventing runner-specific evaluator contracts.
4. Run the skill from `workingDirectory` and keep the repo root as the main workspace context when appropriate.
5. Pass through orchestrator environment variables unchanged unless the runner truly needs additions.
6. Stream stdout and stderr through the provided callbacks.
7. Return normalized status, timing, file paths, and optional usage.
8. Extend `runnerKind` validation in `src/server/types/contracts.ts`.
9. Update runtime wiring in `src/server/runtime.ts`.
10. Update the UI runner list in `app/components/run-console.tsx`.
11. Add unit tests that cover success, failure, timeout, and usage parsing for the new runner.

## Common Mistakes To Avoid

- Bypassing the proxy and calling the real Dify base URL directly
- Returning a custom status shape instead of `completed` / `failed` / `timed_out`
- Forgetting to populate `stdoutPath` and `stderrPath`
- Hiding stdout/stderr instead of streaming it to the repository logs
- Skipping usage extraction when the runner can provide token counts
- Adding a new runner implementation without updating `runnerKind` validation or the UI selector

## Testing A Runner

Follow the pattern already used for `tests/unit/runners/codex-runner.test.ts`.

At minimum, cover:

- prompt or command construction
- exit code to status mapping
- timeout behavior
- stdout/stderr forwarding
- usage extraction

If the runner depends on an external CLI or SDK, isolate that boundary so tests can mock it cleanly.
