# Writing Test Cases

Test cases are the heart of this project.

They define what a skill is supposed to do, which Dify app aliases it may use, what trace steps should happen, and how the run will be scored. If you fork this repo, adding strong test cases is usually the fastest way to make the evaluator useful for your own skills.

## Where Test Cases Live

Test cases are JSON files stored under:

```text
src/server/cases/
```

The case repository walks that directory recursively and loads every `.json` file it finds. That means you can organize cases by app family or scenario as long as they stay under `src/server/cases/`.

Current examples:

- `src/server/cases/chatflow/open-session-and-continue.json`
- `src/server/cases/chatflow/upload-file-then-ask-filename.json`

## The Main Schema

Each file must satisfy the `EvaluationTestCase` contract from `src/server/types/contracts.ts`.

Important fields:

- `id`: stable identifier used by the UI and API
- `title`: short human-readable label
- `appType`: current app family under evaluation
- `requiredApps`: which app aliases must be bound at run time
- `objective`: what success means in plain language
- `promptForAgent`: the instruction the runner will pass to the skill agent
- `maxTurns`: expected interaction depth
- `tokenBudget`: optional token target and max budget
- `artifacts`: optional local test files
- `expectedTrace`: ordered HTTP steps that should appear in the captured trace
- `assertions`: evaluation checks that summarize what matters for scoring
- `notes`: optional extra metadata

## Start From The Built-In Patterns

The two built-in cases are the best templates to copy.

### Pattern 1: Multi-turn conversation reuse

`chatflow.open_session_and_continue.v1` shows how to:

- start a first `/chat-messages` request without `conversation_id`
- extract `conversation_id` from the first response
- require the second request to reuse that exact value
- score whether conversation continuity actually happened

Use this pattern when you want to verify follow-up behavior, memory, or session handling.

### Pattern 2: Upload then reference a file

`chatflow.upload_file_and_ask_filename.v1` shows how to:

- declare a local file artifact
- require an upload call to `/files/upload`
- extract `upload_file_id` from the upload response
- require a second request to attach that uploaded file
- verify final response content using response rules

Use this pattern when you want to test skills that combine local assets with Dify requests.

## Required Apps

`requiredApps` tells the evaluator which app aliases must be bound before a run can start.

Each entry includes:

- `appAlias`: the alias used in prompts and traces, such as `chatbot`
- `appType`: current app family, such as `chatflow`
- `purpose`: a short explanation shown to maintainers

Choose aliases that are stable and descriptive. The alias is what appears in:

- the runner prompt
- proxy environment variable names
- captured trace events
- score matching logic

Changing an alias later usually means updating the prompt, bindings, and trace expectations together.

## Prompting The Agent

`promptForAgent` should be specific enough that the skill knows what to do, but not so prescriptive that it smuggles the answer into the test.

Good prompts usually:

- name the expected app alias
- say whether calls should be blocking or streaming
- describe the sequence of actions to perform
- mention artifacts by `artifactId` when files are involved
- avoid telling the app exactly what text to answer with unless the scenario truly requires that

Keep in mind that the score is based on observable behavior in the trace, not on whether the prompt sounded nice.

## Expected Trace

`expectedTrace.steps` is the most important section of the case.

Each step defines:

- `stepId`: stable name for the step
- `order`: expected relative order
- `appAlias`
- `method`
- `path`
- optional `requestRules`
- optional `responseRules`
- optional `responseExtractors`

The scorer walks expected steps in order and looks for matching trace events by:

- `appAlias`
- HTTP method
- request path

Then it applies request and response rules to the normalized bodies.

## Field Rules

Field rules let you validate important parts of a request or response body without hardcoding the full payload.

Current rule types:

- `equals`
- `non_empty`
- `empty`
- `equals_variable`
- `contains`
- `contains_variable`
- `matches_regex`

Use them to check things like:

- `response_mode` must be `blocking`
- `conversation_id` must be empty on the first turn
- returned `conversation_id` must appear in the follow-up request
- uploaded filenames or MIME types must match expectations
- final answer must contain a phrase from an uploaded file

Prefer rules that catch meaningful regressions. Avoid over-constraining fields that may vary harmlessly.

## Variable Extraction

`responseExtractors` let one step feed later expectations.

Example uses:

- capture `conversation_id` from the first chat response
- capture `upload_file_id` from a file upload response

That extracted value can later be referenced with `equals_variable` or `contains_variable`.

This is one of the most useful parts of the evaluator because it lets you test multi-step workflows without hardcoding runtime-generated IDs.

## Assertions

Assertions summarize what matters about the run at a higher level.

Current assertion types include:

- `http_status_2xx`
- `response_has_field`
- `conversation_reused`
- `minimum_trace_steps`
- `app_alias_used`
- `field_rules_pass`
- `response_content_check`

Use assertions to make the case intent obvious to future maintainers. Even when trace rules already enforce behavior, a good assertion list makes it much easier to understand what the case is trying to protect.

## Token Budgets

`tokenBudget` is optional, but it is valuable when you care about efficiency as well as correctness.

It supports:

- `targetTotalTokens`: the ideal budget
- `maxTotalTokens`: the threshold where token efficiency should bottom out

If the runner returns usage, the scorer uses this budget to compute `tokenEfficiencyScore` and emit findings when usage exceeds the target or max.

Set budgets high enough to allow the intended workflow, but low enough to catch wasteful prompting or loops.

## Artifacts

Use `artifacts` when a case needs local files.

Current artifact support is intentionally narrow:

- `kind` must be `file`

Each artifact can include:

- `artifactId`
- `path`
- `mimeType`
- `displayName`
- `description`

Paths are resolved relative to the repo root through the artifact resolver, so keep them stable and check them into the repo when they are part of the case definition.

## Writing Cases That Produce Useful Scores

Strong cases usually:

- test one scenario clearly instead of mixing unrelated goals
- verify the calls that matter rather than every possible field
- extract runtime values and reuse them in later rules
- include content checks only where user-visible output matters
- add token budgets when you want to compare implementations on efficiency

Weak cases often:

- overfit to one exact payload shape
- encode the desired answer directly into the prompt
- skip variable extraction and then cannot prove state continuity
- use vague assertions that do not reflect how the score is actually computed

## Recommended Workflow

1. Copy the closest existing case.
2. Rename the `id`, `title`, and `objective`.
3. Update `requiredApps` and `promptForAgent`.
4. Define the smallest expected trace that proves the behavior.
5. Add request and response rules for the critical fields only.
6. Add extractors for any generated IDs needed later.
7. Set assertions that match the scenario intent.
8. Add a token budget if efficiency matters.
9. Run the case and inspect `trace.json` plus `score.json`.
10. Tighten or relax rules based on real trace behavior.
