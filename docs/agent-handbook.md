# Agent Handbook

This document is intentionally dense.

It exists for AI agents and maintainers who need the full mental model of how this repo executes an evaluation run. Human readers who just want to use the app or add a basic case can skip this file and use the README plus the contributor guides.

## What This Repo Actually Evaluates

This project does not judge a skill by reading its source code directly.

It evaluates a skill by observing behavior:

1. give the runner a test case and skill path
2. force Dify traffic through a local proxy
3. capture normalized trace events
4. compare those events against explicit expectations
5. compute scores and findings from the observed run

If you are acting as an AI agent in this repo, optimize for trace-observable correctness, not for producing a plausible explanation of what the skill probably did.

## End-To-End Run Lifecycle

### 1. Run creation

The main entrypoint is `POST /api/runs`.

The payload is validated as `StartEvaluationInput` and must currently include:

- `runnerKind`
- `skillPath`
- `testCaseId`
- `appBindings`
- optional `defaultUser`

### 2. Session management

`RunManager` creates an in-memory run session, appends progress logs, and launches the orchestrator asynchronously.

This means there are two related views of a run:

- live session state for the UI
- persisted artifacts under `runs/<runId>/`

### 3. Orchestration

`EvaluatorOrchestrator` is the control center.

It:

- validates the start payload
- loads the selected test case from the case repository
- verifies all required app aliases are bound
- resolves declared artifacts to absolute paths
- creates the per-run directory
- stores app bindings in the run secret store
- builds runner environment variables
- executes the runner
- reads trace output from the repository
- scores the run
- writes score, variables, and final run artifacts

### 4. Proxy mediation

The runner does not receive direct upstream Dify URLs.

Instead, the orchestrator injects local proxy URLs with names like:

```text
DIFY_APP_BASE_URL_CHATBOT
```

Those URLs point to:

```text
/api/runs/:runId/apps/:appAlias/proxy/[...path]
```

The proxy looks up the real binding from the secret store, forwards the request upstream, and writes normalized trace events into the run repository.

### 5. Trace persistence

Trace data is stored in `trace.json` as an ordered list of normalized `TraceEvent` objects.

Each event includes:

- app alias
- request method and path
- normalized request body
- status code
- normalized response body
- timestamps and duration

This trace is the source of truth for scoring.

### 6. Scoring

`scoreRun()` compares expected trace steps with actual trace events, applies field rules, extracts variables, computes weighted metrics, and emits findings.

The final result is persisted as:

- `score.json`
- `variables.json`
- `run.json`

## Environment Variables That Matter

When reasoning about a run, these injected variables are important:

- `EVAL_RUN_ID`: the current run identifier
- `DIFY_APP_USER`: default user identity for the run
- `NO_PROXY`
- `no_proxy`
- `DIFY_APP_BASE_URL_<APP_ALIAS>`: proxy base URL for each required app alias

Important constraint:

- the runner environment contains proxy endpoints, not secret-bearing real Dify endpoints

Do not assume the skill should hit the upstream Dify URL directly. If it does, the evaluator loses trace visibility and the run becomes untrustworthy.

## Contracts Worth Knowing

If you need the repo’s stable vocabulary, these are the most important contracts in `src/server/types/contracts.ts`:

- `StartEvaluationInput`
- `EvaluationTestCase`
- `RunnerExecutionInput`
- `RunnerExecutionResult`
- `TraceEvent`
- `ScoreResult`
- `EvaluationRunResult`

When changing behavior in this repo, preserve these shapes unless you are deliberately evolving the evaluator contract.

## How Matching And Scoring Actually Work

`scoreRun()` does not do semantic fuzzy matching.

For each expected step, it searches forward through the trace for an event whose:

- `appAlias` matches
- request method matches
- request path matches

Then it:

- applies request rules against the normalized request body
- applies response rules against the normalized response body
- extracts declared variables from the response body
- tracks whether conversation continuity checks passed
- counts content-oriented checks

The current score components are:

- `sequenceScore`
- `resultScore`
- `conversationStateScore`
- optional `contentScore`
- optional `tokenEfficiencyScore`

Some scores are optional because they depend on the case or runner:

- no content rules means no `contentScore`
- no usage or no token budget means no `tokenEfficiencyScore`

Weights are normalized dynamically based on which components are active for a run.

## Variable Extraction Model

Variable extraction is how this evaluator proves multi-step correctness without hardcoding runtime-generated identifiers.

Typical examples:

- first response returns `conversation_id`
- later request must reuse that exact `conversation_id`
- upload response returns `id`
- later request must include that value as `upload_file_id`

If you are authoring or debugging a case, inspect `variables.json` alongside `trace.json`. Missing or wrong extracted values often explain downstream rule failures.

## Token Efficiency Model

Token efficiency is intentionally simple:

- at or below `targetTotalTokens` yields full score
- at or above `maxTotalTokens` yields zero
- values in between decay nonlinearly

If usage exceeds the target or max, the scorer emits a `token_budget_exceeded` finding.

This means a runner that cannot report usage is still valid, but it cannot participate fully in efficiency comparison.

## Files You Should Inspect First When Debugging

If a run behaves strangely, inspect these in order:

1. `runs/<runId>/progress.log`
2. `runs/<runId>/runner-output.log`
3. `runs/<runId>/runner-error.log`
4. `runs/<runId>/trace.json`
5. `runs/<runId>/score.json`
6. `runs/<runId>/variables.json`
7. `runs/<runId>/run.json`

That sequence usually tells you whether the failure happened:

- before runner launch
- inside the runner
- at the proxy boundary
- in trace matching
- in rule evaluation
- in token accounting

## Repo Conventions And Do-Not-Break Rules

- Keep traffic flowing through the proxy so traces stay complete.
- Keep app secrets in the run secret store, not in runner-visible config unless there is an explicit design change.
- Keep test case IDs stable once people may depend on them.
- Keep run artifacts machine-readable and easy to diff.
- Preserve the normalized runner status values: `completed`, `failed`, `timed_out`.
- Preserve usage reporting when the runner can expose it.
- Prefer extending existing contracts over inventing runner-specific parallel models.

## What Humans Usually Do Not Need To Memorize

Most human contributors do not need to hold all of this in their head.

They usually only need:

- the README for overall orientation
- `docs/writing-test-cases.md` to add scenarios
- `docs/adding-runners.md` to add execution backends

This file is for the times when an agent or maintainer needs to reason about the full evaluation loop without rediscovering it from source files.
