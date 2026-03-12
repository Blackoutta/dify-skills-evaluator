# Dify API Skills Evaluator

This project is a local evaluator for Dify API skills.

Its job is simple: take a skill built from Dify API docs or the Dify SDK, run that skill against a controlled test case, trace every Dify API call it makes, and score the run so you can understand how good and efficient the skill really is.

The evaluator is especially useful when you are:

- testing whether a skill calls the right Dify endpoints
- checking whether it preserves state correctly across turns
- validating file upload and follow-up flows
- comparing different skill implementations by score, findings, and token usage
- forking this repo to add new runners or more realistic evaluation cases

## What You Give The Evaluator

Each evaluation run needs:

- a `skillPath` pointing at the skill under test
- a `testCaseId` for the evaluation scenario
- a `runnerKind` to execute the skill
- one or more Dify `appBindings` with the real base URL and API key for each required app
- an optional `defaultUser` for stable user identity during the run

Current runner support:

- `codex`

## What You Get Back

Every run produces durable artifacts under `runs/<runId>/`:

- `run.json`: full run result
- `trace.json`: normalized HTTP trace captured through the proxy
- `score.json`: score breakdown, weights, and findings
- `variables.json`: variables extracted from trace responses
- `progress.log`: orchestrator progress log
- `runner-output.log`: runner stdout
- `runner-error.log`: runner stderr

These artifacts help answer questions such as:

- Did the skill call the right endpoint in the right order?
- Did it reuse conversation state correctly?
- Did it send the expected request fields?
- Did the app return the expected result?
- How token-efficient was the run?

## Scoring At A Glance

The evaluator currently scores runs across these dimensions:

- `sequenceScore`: whether expected trace steps happened in the correct order
- `resultScore`: whether matched steps succeeded and passed request/response rules
- `conversationStateScore`: whether conversation state was preserved when required
- `contentScore`: whether response content matched expected content rules
- `tokenEfficiencyScore`: whether usage stayed near the test case token budget

The final score also includes findings that explain what went wrong or what exceeded budget.

## How A Run Works

1. A client submits `POST /api/runs`.
2. The orchestrator validates the input and loads the selected test case.
3. Required app bindings are stored for the run.
4. Test artifacts are resolved to absolute local paths.
5. The runner receives the skill path, test case prompt, artifact bindings, and proxy-based app URLs.
6. The skill calls Dify through the local proxy route.
7. The proxy normalizes requests and responses into trace events.
8. The scorer compares the trace against the test case expectations and writes artifacts.

## Quickstart

Requirements:

- Node.js 20+
- npm
- `codex` in `PATH`, or set `CODEX_RUNNER_BIN`, if you want to execute real runner flows

Prepare your Dify environment first:

- make sure you have a working Dify instance and the app/API credentials needed for the test cases
- import the example chatflow DSL from [`dsl/test-chatflow.yml`](/Users/yang/Desktop/projects/dify-api-skills/dsl/test-chatflow.yml) into Dify and create an API key before running evaluations

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Run checks:

```bash
npm test
npm run typecheck
npm run coverage
```

## Example Run Payload

```json
{
  "runnerKind": "codex",
  "skillPath": "/absolute/path/to/skill",
  "testCaseId": "chatflow.open_session_and_continue.v1",
  "defaultUser": "eval-user-001",
  "appBindings": [
    {
      "appAlias": "chatbot",
      "appType": "chatflow",
      "realDifyBaseUrl": "https://your-dify.example.com/v1",
      "apiKey": "app-xxx",
      "user": "eval-user-001"
    }
  ]
}
```

## Built-In Test Cases

The repo currently includes two example chatflow cases:

- `chatflow.open_session_and_continue.v1`
- `chatflow.upload_file_and_ask_filename.v1`

Those cases show the two main evaluation patterns already supported:

- multi-turn chat with conversation reuse
- file upload followed by a content-based follow-up request

## Extending The Repo

People who fork this repo will usually extend one of these two surfaces first:

- test cases: add new evaluation scenarios, trace expectations, and scoring rules
- runners: add another agent/runtime integration besides the current Codex runner

Guides:

- [Writing Test Cases](docs/writing-test-cases.md)
- [Adding Runners](docs/adding-runners.md)
- [Agent Handbook](docs/agent-handbook.md)

The agent handbook is intentionally denser and more operational. It is mainly there for AI agents or maintainers who want the full execution model without cluttering the README.

## Project Structure

Key directories:

- `app/`: Next.js UI and API routes
- `src/server/orchestrator/`: evaluation orchestration
- `src/server/runners/`: runner abstraction and implementations
- `src/server/cases/`: JSON test case definitions
- `src/server/scoring/`: scoring and variable extraction
- `src/server/proxy/`: Dify proxy and trace normalization
- `fixtures/`: local test assets used by cases
- `runs/`: generated run artifacts
- `tests/unit/`: unit tests
- `docs/`: contributor and agent-oriented documentation

## Commands

```bash
npm run dev
npm test
npm run typecheck
npm run coverage
```

## Current Limits

This is still an early evaluator. Today it has:

- one production-shaped runner implementation: `CodexRunner`
- a small set of built-in test cases
- rule-based scoring rather than model-based judgment
- unit-test coverage for the core backend pieces, but no route-level integration suite yet

That makes it a strong base for experimentation, comparison, and extension, even though it is not yet a fully generalized evaluation platform.
