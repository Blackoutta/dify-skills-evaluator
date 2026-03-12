# Advanced Chat App Curl Guide

Use this guide when the app still calls `POST /chat-messages` but behaves more like a traced workflow execution than a plain chat stream.

## When To Prefer Advanced Chat

Prefer this guide over [chat.md](chat.md) when any of these are true:

- the stream exposes workflow lifecycle events
- the stream exposes node-level execution details
- the request `inputs` can include file-type variables
- the user wants annotation operations alongside chat execution
- `GET /info` reports `mode: "advanced-chat"`

## Core Call

Endpoint:

- `POST /chat-messages`

```bash
curl -N "$DIFY_BASE_URL/chat-messages" \
  --http1.1 \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "query": "Read the uploaded document and produce a structured summary.",
    "inputs": {
      "source_docs": [
        {
          "type": "document",
          "transfer_method": "local_file",
          "upload_file_id": "'"$UPLOAD_FILE_ID"'"
        }
      ]
    },
    "response_mode": "streaming",
    "conversation_id": "",
    "user": "'"$DIFY_USER"'"
  }'
```

Differences from regular chat:

- `inputs` may carry file-typed values, not only plain text variables.
- `files` can still be present when the app supports top-level multimodal input.
- `workflow_id` can pin a specific published workflow version.

## Two-Turn Continuation Recipe

Even in `advanced-chat`, follow-up turns still depend on `conversation_id`.

First turn:

```bash
FIRST_RESPONSE=$(curl -sS "$DIFY_BASE_URL/chat-messages" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  --fail-with-body \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "query": "Hello!",
    "inputs": {},
    "response_mode": "blocking",
    "conversation_id": "",
    "user": "'"$DIFY_USER"'"
  }')
```

Extract state:

```bash
CONVERSATION_ID=$(printf '%s' "$FIRST_RESPONSE" | jq -r '.conversation_id')
```

Second turn:

```bash
curl -sS "$DIFY_BASE_URL/chat-messages" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  --fail-with-body \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "query": "Please continue using the same conversation context.",
    "inputs": {},
    "response_mode": "blocking",
    "conversation_id": "'"$CONVERSATION_ID"'",
    "user": "'"$DIFY_USER"'"
  }'
```

Hard rules:

- first turn uses empty `conversation_id`
- second turn must reuse the extracted `conversation_id`
- keep `user` unchanged
- keep the required `response_mode` unchanged

## Streaming Events That Matter

Advanced chat streams can emit the normal chat events plus workflow trace events:

- `workflow_started`
- `node_started`
- `node_finished`
- `workflow_finished`
- `message`
- `message_file`
- `message_end`
- `tts_message`
- `tts_message_end`
- `message_replace`
- `error`
- `ping`

What to do with them:

- save `task_id` for stop
- save `workflow_run_id` if you need to explain workflow execution
- use `node_started` and `node_finished` to surface tracing information
- still capture `conversation_id` and `message_id` for follow-up operations

## Stop A Streaming Run

```bash
curl -sS "$DIFY_BASE_URL/chat-messages/$TASK_ID/stop" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  --fail-with-body \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "user": "'"$DIFY_USER"'"
  }'
```

## Annotation Operations

Advanced chat exposes the same annotation endpoints as the chat template:

- `GET /apps/annotations`
- `POST /apps/annotations`
- `PUT /apps/annotations/{annotation_id}`
- `DELETE /apps/annotations/{annotation_id}`
- `POST /apps/annotation-reply/{action}`
- `GET /apps/annotation-reply/{action}/status/{job_id}`

Use the exact `curl` patterns in [chat.md](chat.md) for those calls.

## Shared Follow-Up Operations

Use [chat.md](chat.md) for:

- conversation history
- conversation list, rename, and delete
- conversation variable read and update
- feedback and suggested questions
- speech-to-text and text-to-audio
- app `meta`, `parameters`, and `site`

## Local File Workflow

1. Upload the file with `/files/upload` as described in [common.md](common.md).
2. Insert the returned `upload_file_id` into the file-type variable inside `inputs`.
3. Start the streaming chat request with `curl -N`.
4. Save `task_id`, `workflow_run_id`, `conversation_id`, and `message_id`.
