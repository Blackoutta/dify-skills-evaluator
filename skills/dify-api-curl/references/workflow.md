# Workflow App Curl Guide

Use this guide for non-session workflow apps that run published workflows and return workflow execution metadata.

## Core Call

Endpoint:

- `POST /workflows/run`

```bash
curl -N "$DIFY_BASE_URL/workflows/run" \
  --http1.1 \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "inputs": {
      "topic": "AI observability"
    },
    "response_mode": "streaming",
    "user": "'"$DIFY_USER"'"
  }'
```

Use this shape when you want the currently published workflow version.

## Run A Specific Workflow Version

Endpoint:

- `POST /workflows/:workflow_id/run`

```bash
curl -N "$DIFY_BASE_URL/workflows/$WORKFLOW_ID/run" \
  --http1.1 \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "inputs": {
      "topic": "AI observability"
    },
    "response_mode": "streaming",
    "user": "'"$DIFY_USER"'"
  }'
```

Use this only with a published workflow UUID copied from version history.

## File Array Inputs

Workflow input variables can be file arrays:

```bash
curl -N "$DIFY_BASE_URL/workflows/run" \
  --http1.1 \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
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
    "user": "'"$DIFY_USER"'"
  }'
```

## Streaming Events

Workflow streams can emit:

- `workflow_started`
- `node_started`
- `text_chunk`
- `node_finished`
- `workflow_finished`
- `tts_message`
- `tts_message_end`
- `ping`

Capture:

- `task_id` for stop
- `workflow_run_id` for run detail

Use `text_chunk` when the caller wants incremental text output. Use `node_*` events when the caller wants tracing detail.

## Blocking Response

Blocking mode returns one JSON object with:

- `workflow_run_id`
- `task_id`
- `data.status`
- `data.outputs`
- `data.error`
- `data.elapsed_time`
- `data.total_tokens`
- `data.total_steps`

## Get Workflow Run Detail

Endpoint:

- `GET /workflows/run/:workflow_run_id`

```bash
curl -sS "$DIFY_BASE_URL/workflows/run/$WORKFLOW_RUN_ID" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Use this after a streaming run when you need final inputs, outputs, timing, or status.

## Stop A Streaming Workflow

Endpoint:

- `POST /workflows/tasks/:task_id/stop`

```bash
curl -sS "$DIFY_BASE_URL/workflows/tasks/$TASK_ID/stop" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  --fail-with-body \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "user": "'"$DIFY_USER"'"
  }'
```

## Get Workflow Logs

Endpoint:

- `GET /workflows/logs`

Basic call:

```bash
curl -sS "$DIFY_BASE_URL/workflows/logs" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Filtered call:

```bash
curl -sS "$DIFY_BASE_URL/workflows/logs?status=succeeded&page=1&limit=20&created_by_end_user_session_id=$DIFY_USER" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Useful filters from the template:

- `keyword`
- `status`
- `page`
- `limit`
- `created_by_end_user_session_id`
- `created_by_account`

## Related Shared Endpoints

Read [common.md](common.md) for:

- `/files/upload`
- `/end-users/:end_user_id`
- `/info`
- `/parameters`
- `/site`

## When Not To Use This Guide

Do not use workflow endpoints when the user expects persistent conversations, message history, or conversation rename/delete operations.

Use [chat.md](chat.md) or [advanced_chat.md](advanced_chat.md) instead.
