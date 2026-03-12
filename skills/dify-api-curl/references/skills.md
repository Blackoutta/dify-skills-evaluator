# Dify API Curl Skill Index

This skill set is derived from the Dify API templates in:

- `/Users/yang/Desktop/projects/dify/web/app/components/develop/template/template.en.mdx`
- `/Users/yang/Desktop/projects/dify/web/app/components/develop/template/template_chat.en.mdx`
- `/Users/yang/Desktop/projects/dify/web/app/components/develop/template/template_advanced_chat.en.mdx`
- `/Users/yang/Desktop/projects/dify/web/app/components/develop/template/template_workflow.en.mdx`

## Read Order

1. Read [common.md](common.md).
2. Choose exactly one primary app guide:
   - [completion.md](completion.md)
   - [chat.md](chat.md)
   - [advanced_chat.md](advanced_chat.md)
   - [workflow.md](workflow.md)

## Choose The Right App Family

| File | Use when | Primary endpoint |
| --- | --- | --- |
| [completion.md](completion.md) | The app is stateless and only needs one-shot text generation. | `POST /completion-messages` |
| [chat.md](chat.md) | The app needs session persistence, conversation history, suggested questions, or conversation variables. | `POST /chat-messages` |
| [advanced_chat.md](advanced_chat.md) | The app is chat-based but the stream also exposes workflow or node execution traces, or you need annotation APIs. | `POST /chat-messages` |
| [workflow.md](workflow.md) | The app is a workflow runner with no conversation session, needs workflow version pinning, run detail, or workflow logs. | `POST /workflows/run` |

## Mode Mapping From `GET /info`

Use `GET /info` as the authoritative first signal:

- `mode: "completion"` -> [completion.md](completion.md)
- `mode: "chat"` -> [chat.md](chat.md)
- `mode: "advanced-chat"` -> [advanced_chat.md](advanced_chat.md)
- `mode: "workflow"` -> [workflow.md](workflow.md)

`advanced-chat` still uses `POST /chat-messages`, but the response behavior and continuation rules are closer to [advanced_chat.md](advanced_chat.md) than [chat.md](chat.md).

## Shared Rules

- Use `Authorization: Bearer $DIFY_API_KEY` on every request.
- Match the requested `response_mode` exactly. Do not replace a required `blocking` step with `streaming`.
- Use `curl -N` for streaming requests so `data:` SSE frames are printed immediately.
- Run `GET /parameters` before building request JSON if variable names are not already known.
- Keep `user` stable across related requests.
- For local files, upload with `/files/upload` first and reuse the returned `id` as `upload_file_id`.
- For chat-family multi-turn tasks, extract `conversation_id` from the first response and reuse it verbatim in the next `/chat-messages` request.

## Endpoint Map

### Completion

- `POST /completion-messages`
- `POST /completion-messages/:task_id/stop`
- `POST /messages/:message_id/feedbacks`
- `GET /app/feedbacks`
- `POST /files/upload`
- `GET /files/:file_id/preview`
- `GET /end-users/:end_user_id`
- `POST /text-to-audio`
- `GET /info`
- `GET /parameters`
- `GET /site`

### Chat

- `POST /chat-messages`
- `POST /chat-messages/:task_id/stop`
- `GET /messages/{message_id}/suggested`
- `GET /messages`
- `GET /conversations`
- `DELETE /conversations/:conversation_id`
- `POST /conversations/:conversation_id/name`
- `GET /conversations/:conversation_id/variables`
- `PUT /conversations/:conversation_id/variables/:variable_id`
- `POST /messages/:message_id/feedbacks`
- `GET /app/feedbacks`
- `POST /audio-to-text`
- `POST /text-to-audio`
- `POST /files/upload`
- `GET /files/:file_id/preview`
- `GET /end-users/:end_user_id`
- `GET /info`
- `GET /parameters`
- `GET /meta`
- `GET /site`
- `GET /apps/annotations`
- `POST /apps/annotations`
- `PUT /apps/annotations/{annotation_id}`
- `DELETE /apps/annotations/{annotation_id}`
- `POST /apps/annotation-reply/{action}`
- `GET /apps/annotation-reply/{action}/status/{job_id}`

### Advanced Chat

- Same management endpoints as [chat.md](chat.md)
- Distinguishing behavior: `/chat-messages` can emit workflow and node trace events in the stream
- Distinguishing behavior: `inputs` may contain file-type variables in addition to top-level `files`

### Workflow

- `POST /workflows/run`
- `POST /workflows/:workflow_id/run`
- `GET /workflows/run/:workflow_run_id`
- `POST /workflows/tasks/:task_id/stop`
- `GET /workflows/logs`
- `POST /files/upload`
- `GET /end-users/:end_user_id`
- `GET /info`
- `GET /parameters`
- `GET /site`
