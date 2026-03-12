# Chat App Curl Guide

Use this guide for session-based apps that keep `conversation_id` and expose conversation management APIs.

For any multi-turn task, preserving `conversation_id` is mandatory.

## Core Call

Endpoint:

- `POST /chat-messages`

New conversation:

```bash
curl -N "$DIFY_BASE_URL/chat-messages" \
  --http1.1 \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "query": "What are the main features of the iPhone 13 Pro Max?",
    "inputs": {},
    "response_mode": "streaming",
    "conversation_id": "",
    "user": "'"$DIFY_USER"'"
  }'
```

Continue an existing conversation:

```bash
curl -N "$DIFY_BASE_URL/chat-messages" \
  --http1.1 \
  --connect-timeout "$DIFY_CURL_CONNECT_TIMEOUT" \
  --max-time "$DIFY_CURL_MAX_TIME" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "query": "Now compare it with the iPhone 15 Pro Max.",
    "inputs": {},
    "response_mode": "streaming",
    "conversation_id": "'"$CONVERSATION_ID"'",
    "user": "'"$DIFY_USER"'"
  }'
```

Useful request fields:

- `query`: the user message
- `conversation_id`: omit or empty for a new thread
- `auto_generate_name`: defaults to `true`
- `workflow_id`: optional published workflow version UUID
- `trace_id`: optional trace identifier
- `files`: optional multimodal input list

## Two-Turn Continuation Recipe

Use this exact pattern when the task says "continue the same conversation".

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

Extract the returned conversation id before the second turn:

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
    "query": "Can you continue from the same conversation?",
    "inputs": {},
    "response_mode": "blocking",
    "conversation_id": "'"$CONVERSATION_ID"'",
    "user": "'"$DIFY_USER"'"
  }'
```

Hard rules:

- first turn: `conversation_id` must be empty
- later turns: `conversation_id` must equal the value returned by the first response
- reuse the same `user`
- do not switch from required `blocking` to `streaming`

## Streaming Events

Chat streams can emit:

- `message`
- `agent_message`
- `agent_thought`
- `message_file`
- `message_end`
- `tts_message`
- `tts_message_end`
- `message_replace`
- `error`
- `ping`

Capture these values from the stream:

- `task_id` for stop
- `message_id` for feedback and suggestions
- `conversation_id` for follow-up calls

For streaming multi-turn flows, extract `conversation_id` from the SSE events before making the next request.

## Stop A Streaming Chat

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

## History And Conversation Management

Get message history:

```bash
curl -sS "$DIFY_BASE_URL/messages?user=$DIFY_USER&conversation_id=$CONVERSATION_ID&limit=20" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

List conversations:

```bash
curl -sS "$DIFY_BASE_URL/conversations?user=$DIFY_USER&limit=20&sort_by=-updated_at" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Rename a conversation:

```bash
curl -sS "$DIFY_BASE_URL/conversations/$CONVERSATION_ID/name" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "name": "Product comparison",
    "auto_generate": false,
    "user": "'"$DIFY_USER"'"
  }'
```

Delete a conversation:

```bash
curl -sS -X DELETE "$DIFY_BASE_URL/conversations/$CONVERSATION_ID" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "user": "'"$DIFY_USER"'"
  }'
```

## Suggested Questions And Feedback

Get suggested follow-up questions:

```bash
curl -sS "$DIFY_BASE_URL/messages/$MESSAGE_ID/suggested" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Send feedback:

```bash
curl -sS "$DIFY_BASE_URL/messages/$MESSAGE_ID/feedbacks" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "rating": "dislike",
    "user": "'"$DIFY_USER"'"
  }'
```

List app feedback:

```bash
curl -sS "$DIFY_BASE_URL/app/feedbacks?page=1&limit=20" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

## Conversation Variables

Read variables captured during the conversation:

```bash
curl -sS "$DIFY_BASE_URL/conversations/$CONVERSATION_ID/variables?user=$DIFY_USER&limit=100" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Update one variable:

```bash
curl -sS -X PUT "$DIFY_BASE_URL/conversations/$CONVERSATION_ID/variables/$VARIABLE_ID" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "value": "Updated Value",
    "user": "'"$DIFY_USER"'"
  }'
```

## Audio And App Metadata

Speech to text:

```bash
curl -sS "$DIFY_BASE_URL/audio-to-text" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -F "file=@/absolute/path/to/audio.mp3" \
  -F "user=$DIFY_USER"
```

Text to audio:

```bash
curl -sS "$DIFY_BASE_URL/text-to-audio" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "text": "Turn this answer into speech.",
    "user": "'"$DIFY_USER"'"
  }'
```

Tool icon metadata:

```bash
curl -sS "$DIFY_BASE_URL/meta" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

## Annotation Endpoints

This app family exposes annotation management:

List annotations:

```bash
curl -sS "$DIFY_BASE_URL/apps/annotations?page=1&limit=20" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Create an annotation:

```bash
curl -sS "$DIFY_BASE_URL/apps/annotations" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "question": "What is your name?",
    "answer": "I am Dify."
  }'
```

Update an annotation:

```bash
curl -sS -X PUT "$DIFY_BASE_URL/apps/annotations/$ANNOTATION_ID" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "question": "What is your name?",
    "answer": "I am Dify."
  }'
```

Delete an annotation:

```bash
curl -sS -X DELETE "$DIFY_BASE_URL/apps/annotations/$ANNOTATION_ID" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

Initialize annotation reply settings:

```bash
curl -sS "$DIFY_BASE_URL/apps/annotation-reply/enable" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "score_threshold": 0.9,
    "embedding_provider_name": "zhipu",
    "embedding_model_name": "embedding_3"
  }'
```

Check async annotation reply job status:

```bash
curl -sS "$DIFY_BASE_URL/apps/annotation-reply/enable/status/$JOB_ID" \
  -H "Authorization: Bearer $DIFY_API_KEY"
```

## Related Shared Endpoints

Read [common.md](common.md) for:

- `/files/upload`
- `/files/:file_id/preview`
- `/end-users/:end_user_id`
- `/info`
- `/parameters`
- `/site`
