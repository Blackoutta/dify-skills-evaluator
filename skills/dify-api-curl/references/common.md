# Common Dify Curl Patterns

## Base Environment

```bash
export DIFY_BASE_URL="https://your-dify-host/v1"
export DIFY_API_KEY="app-xxxxxxxx"
export DIFY_USER="abc-123"
export DIFY_CURL_CONNECT_TIMEOUT="${DIFY_CURL_CONNECT_TIMEOUT:-5}"
export DIFY_CURL_MAX_TIME="${DIFY_CURL_MAX_TIME:-120}"
```

If the host path already includes `/v1`, do not append another `/v1`.

Use `DIFY_CURL_MAX_TIME` as the default request timeout unless the caller explicitly wants another value.

## Authentication

Every request uses bearer auth:

```bash
-H "Authorization: Bearer $DIFY_API_KEY"
```

## First Call When Inputs Are Unknown

Inspect the published app schema before writing request JSON:

```bash
curl -sS "$DIFY_BASE_URL/parameters" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Use the response to discover:

- required input variables
- supported upload types
- speech and TTS capabilities
- whether annotation reply is enabled

Also inspect:

- whether the app mode suggests `chat` or `advanced-chat`
- whether a follow-up turn will require `conversation_id`

## Streaming Versus Blocking

Use blocking when the caller wants one final JSON payload:

```bash
"response_mode": "blocking"
```

Use streaming when the caller wants SSE events:

```bash
"response_mode": "streaming"
```

For streaming, use `-N`:

```bash
curl -N "$DIFY_BASE_URL/..." \
  --http1.1 \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{...}'
```

For blocking, use:

```bash
curl -sS "$DIFY_BASE_URL/..." \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  --fail-with-body \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{...}'
```

Important identifiers returned by Dify:

- `task_id`: needed for stop endpoints
- `message_id`: needed for feedback and suggested questions
- `conversation_id`: needed for chat follow-up calls
- `workflow_run_id`: needed for workflow run detail

Do not change `response_mode` just because one example in the skill uses another mode. If the task or evaluator requires `blocking`, keep `blocking`.

## State Carry-Forward Rules

For multi-turn chat or advanced-chat tasks:

1. Send the first request with `conversation_id` empty.
2. Read the first response.
3. Extract `conversation_id`.
4. Reuse that exact `conversation_id` in the second request.
5. Reuse the same `user` value across both turns.

Never send an empty `conversation_id` on a follow-up turn.

Minimal shell pattern:

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

CONVERSATION_ID=$(printf '%s' "$FIRST_RESPONSE" | jq -r '.conversation_id')
```

If `jq` is unavailable, inspect the JSON body directly and copy the returned `conversation_id` before sending the next request.

## Trace IDs

If distributed tracing matters, prefer the header form because Dify gives it highest priority:

```bash
-H "X-Trace-Id: your-trace-id"
```

Body or query `trace_id` also works but is lower priority.

## Local File Upload

Upload the file first, then reuse the returned `id` as `upload_file_id`.

```bash
curl -sS "$DIFY_BASE_URL/files/upload" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  --fail-with-body \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -F "file=@/absolute/path/to/file.pdf" \
  -F "user=$DIFY_USER"
```

Typical follow-up payload fragment:

```json
{
  "type": "document",
  "transfer_method": "local_file",
  "upload_file_id": "returned-file-id"
}
```

Use `remote_url` instead when the app accepts URL-based files:

```json
{
  "type": "image",
  "transfer_method": "remote_url",
  "url": "https://example.com/image.png"
}
```

## Shared Metadata Endpoints

Inspect app basics:

```bash
curl -sS "$DIFY_BASE_URL/info" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Inspect WebApp settings:

```bash
curl -sS "$DIFY_BASE_URL/site" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Resolve an end user when another API returns an end-user UUID:

```bash
curl -sS "$DIFY_BASE_URL/end-users/$END_USER_ID" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Preview an uploaded file when the app exposes the preview endpoint:

```bash
curl -L "$DIFY_BASE_URL/files/$FILE_ID/preview" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

## Response Handling

- Expect a hard timeout risk in blocking mode for long requests.
- Expect `ping` events during SSE streams.
- Default to `DIFY_CURL_MAX_TIME=120` unless the caller gives a different timeout budget.
- Report app-level error codes as returned, especially `invalid_param`, `app_unavailable`, `provider_not_initialize`, `provider_quota_exceeded`, and model-specific failure codes.
