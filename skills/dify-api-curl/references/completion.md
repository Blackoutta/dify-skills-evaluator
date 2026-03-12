# Completion App Curl Guide

Use this guide for stateless generation apps that do not keep conversation history.

## Core Call

Endpoint:

- `POST /completion-messages`

Typical request:

```bash
curl -N "$DIFY_BASE_URL/completion-messages" \
  --http1.1 \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "inputs": {
      "query": "Summarize this paragraph in 3 bullets."
    },
    "response_mode": "streaming",
    "user": "'"$DIFY_USER"'"
  }'
```

Key request rules:

- `inputs` is required.
- The common published schema uses `inputs.query`, but always verify with `GET /parameters`.
- `files` is optional and only useful when the model/app supports file-aware input.

## Response Shape

Blocking mode returns one JSON object with:

- `message_id`
- `mode`
- `answer`
- `metadata.usage`

Streaming mode emits SSE events such as:

- `message`
- `message_end`
- `tts_message`
- `tts_message_end`
- `message_replace`
- `error`
- `ping`

Save `task_id` from the stream if you may need to stop generation.

## Stop A Streaming Request

Endpoint:

- `POST /completion-messages/:task_id/stop`

```bash
curl -sS "$DIFY_BASE_URL/completion-messages/$TASK_ID/stop" \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  --fail-with-body \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "user": "'"$DIFY_USER"'"
  }'
```

## Feedback

Send message feedback:

```bash
curl -sS "$DIFY_BASE_URL/messages/$MESSAGE_ID/feedbacks" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "rating": "like",
    "user": "'"$DIFY_USER"'"
  }'
```

List application feedback:

```bash
curl -sS "$DIFY_BASE_URL/app/feedbacks?page=1&limit=20" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

## Text To Audio

Use this only when the app supports TTS:

```bash
curl -sS "$DIFY_BASE_URL/text-to-audio" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "text": "Read this response aloud.",
    "user": "'"$DIFY_USER"'"
  }'
```

## Related Shared Endpoints

Read [common.md](common.md) for:

- `/files/upload`
- `/files/:file_id/preview`
- `/end-users/:end_user_id`
- `/info`
- `/parameters`
- `/site`

## When Not To Use This Guide

Do not use completion endpoints when:

- the user needs persistent conversations
- the user needs conversation history or renaming
- the app is a workflow runner

Use [chat.md](chat.md) or [workflow.md](workflow.md) instead.
