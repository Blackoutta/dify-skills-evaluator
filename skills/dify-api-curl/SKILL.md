---
name: dify-api-curl
description: Build and debug Dify Service API requests with curl across completion, chat, advanced chat, and workflow apps. Use when Codex needs to choose the right Dify app API, inspect app parameters, stream SSE responses, upload files, manage conversations, stop running tasks, fetch workflow logs, or operate annotation endpoints while keeping curl as the primary caller.
---

# Dify API Curl

Use this skill to translate Dify Service API tasks into ready-to-run `curl` commands.

## Workflow Decision Tree

1. Read [references/skills.md](references/skills.md) first.
2. Read [references/common.md](references/common.md) for auth, environment variables, response-mode rules, state carry-forward, SSE, uploads, and shared endpoints.
3. Choose one app family:
   - Read [references/completion.md](references/completion.md) for stateless text generation with `/completion-messages`.
   - Read [references/chat.md](references/chat.md) for session-based chat, conversation history, suggestions, and conversation variables.
   - Read [references/advanced_chat.md](references/advanced_chat.md) for chat requests that expose workflow/node trace events or annotation management.
   - Read [references/workflow.md](references/workflow.md) for non-session workflow execution, specific workflow versions, run detail, and logs.

## Operating Rules

- Prefer `curl` over SDK snippets unless the user explicitly asks for another client.
- Call `GET /parameters` before composing a request if the required input variable names are unknown.
- Respect the caller's required `response_mode`. Do not silently switch a required `blocking` call to `streaming`.
- Read timeout flags from environment variables instead of hardcoding them per command when possible.
- Use `curl -N` only for `response_mode=streaming` so SSE frames are not buffered.
- Preserve and surface returned identifiers: `task_id`, `message_id`, `conversation_id`, and `workflow_run_id`.
- For chat-family follow-up turns, extract `conversation_id` from the first response and reuse that exact value in the second request. Never leave `conversation_id` empty when continuing a conversation.
- Keep `user` stable across turns of the same chat or workflow session.
- Upload local files first with `/files/upload`, then reference `upload_file_id` in the follow-up request.
- Use `X-Trace-Id` when the user wants request tracing; otherwise body/query `trace_id` is acceptable but lower priority.

## Output Shape

When answering with this skill:

- Pick the correct app family explicitly.
- If `/info` returns `mode: "advanced-chat"`, prefer [references/advanced_chat.md](references/advanced_chat.md) even though the endpoint is still `/chat-messages`.
- Show the minimal environment variables required to run the request.
- Return one primary `curl` example first.
- Add follow-up `curl` commands only for the next likely step: stop, fetch history, list logs, rename conversation, or inspect parameters.
- For multi-turn chat tasks, show the handoff step that stores `conversation_id` between turns.
- Mention the key streaming events or response fields that matter for that app family.
