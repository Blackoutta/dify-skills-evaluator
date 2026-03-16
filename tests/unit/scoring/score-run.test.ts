import { describe, expect, it } from "vitest";

import { scoreRun } from "@/src/server/scoring/score-run";
import type { EvaluationTestCase, TraceEvent } from "@/src/server/types/contracts";

const simpleCase: EvaluationTestCase = {
  id: "chatflow.open_session_and_continue.v1",
  title: "Simple case",
  appType: "chatflow",
  requiredApps: [{ appAlias: "chatbot", appType: "chatflow", purpose: "chat" }],
  objective: "Test",
  promptForAgent: "Do it",
  maxTurns: 2,
  tokenBudget: {
    targetTotalTokens: 1000,
    maxTotalTokens: 2000,
  },
  expectedTrace: {
    steps: [
      {
        stepId: "open",
        order: 1,
        appAlias: "chatbot",
        method: "POST",
        path: "/chat-messages",
        requestRules: [{ path: "json.conversation_id", rule: "empty" }],
        responseRules: [{ path: "json.conversation_id", rule: "non_empty" }],
        responseExtractors: [{ variableName: "conversation_id", fromPath: "json.conversation_id" }],
      },
      {
        stepId: "continue",
        order: 2,
        appAlias: "chatbot",
        method: "POST",
        path: "/chat-messages",
        requestRules: [{ path: "json.conversation_id", rule: "equals_variable", variableName: "conversation_id" }],
        responseRules: [{ path: "json.answer", rule: "non_empty" }],
      },
    ],
  },
  assertions: [{ id: "a", description: "desc", type: "conversation_reused" }],
};

const uploadCase: EvaluationTestCase = {
  id: "chatflow.upload_file_and_ask_filename.v1",
  title: "Upload and ask",
  appType: "chatflow",
  requiredApps: [{ appAlias: "chatbot", appType: "chatflow", purpose: "chat" }],
  objective: "Test upload and retry-aware scoring",
  promptForAgent: "Do it",
  maxTurns: 2,
  expectedTrace: {
    steps: [
      {
        stepId: "upload_source_file",
        order: 1,
        appAlias: "chatbot",
        method: "POST",
        path: "/files/upload",
        requestRules: [{ path: "multipart.fields.user", rule: "non_empty" }],
        responseRules: [{ path: "json.id", rule: "non_empty" }],
        responseExtractors: [{ variableName: "uploaded_file_id", fromPath: "json.id" }],
      },
      {
        stepId: "ask_for_file_content",
        order: 2,
        appAlias: "chatbot",
        method: "POST",
        path: "/chat-messages",
        requestRules: [
          { path: "json.response_mode", rule: "equals", value: "blocking" },
          { path: "json.conversation_id", rule: "empty" },
          { path: "json.user", rule: "non_empty" },
          { path: "json.files[0].type", rule: "equals", value: "document" },
          { path: "json.files[0].transfer_method", rule: "equals", value: "local_file" },
          { path: "json.files[0].upload_file_id", rule: "equals_variable", variableName: "uploaded_file_id" },
        ],
        responseRules: [{ path: "json.answer", rule: "contains", value: "hey, you are awesome!" }],
      },
    ],
  },
  assertions: [{ id: "a", description: "desc", type: "response_content_check" }],
};

function makeTrace(conversationId = "conv-1"): TraceEvent[] {
  return [
    {
      id: "1",
      runId: "run-1",
      stepIndex: 1,
      appAlias: "chatbot",
      timestampStart: "2026-03-11T00:00:00.000Z",
      timestampEnd: "2026-03-11T00:00:00.000Z",
      durationMs: 0,
      request: {
        method: "POST",
        url: "http://localhost/open",
        path: "/chat-messages",
        query: {},
        headers: {},
        body: { kind: "json", value: { conversation_id: "" } },
      },
      response: {
        status: 200,
        headers: {},
        body: { kind: "json", value: { conversation_id: "conv-1", answer: "hello" } },
      },
    },
    {
      id: "2",
      runId: "run-1",
      stepIndex: 2,
      appAlias: "chatbot",
      timestampStart: "2026-03-11T00:00:00.000Z",
      timestampEnd: "2026-03-11T00:00:00.000Z",
      durationMs: 0,
      request: {
        method: "POST",
        url: "http://localhost/continue",
        path: "/chat-messages",
        query: {},
        headers: {},
        body: { kind: "json", value: { conversation_id: conversationId } },
      },
      response: {
        status: 200,
        headers: {},
        body: { kind: "json", value: { answer: "done" } },
      },
    },
  ];
}

function makeTraceWithSetup(conversationId = "conv-1"): TraceEvent[] {
  return [
    {
      id: "setup-1",
      runId: "run-1",
      stepIndex: 1,
      appAlias: "chatbot",
      timestampStart: "2026-03-11T00:00:00.000Z",
      timestampEnd: "2026-03-11T00:00:00.000Z",
      durationMs: 0,
      request: {
        method: "GET",
        url: "http://localhost/info",
        path: "/info",
        query: {},
        headers: {},
      },
      response: {
        status: 200,
        headers: {},
        body: { kind: "json", value: { mode: "advanced-chat" } },
      },
    },
    ...makeTrace(conversationId).map((step, index) => ({
      ...step,
      stepIndex: index + 2,
    })),
  ];
}

function makeUploadTraceWithRetry(): TraceEvent[] {
  return [
    {
      id: "upload-1",
      runId: "run-2",
      stepIndex: 1,
      appAlias: "chatbot",
      timestampStart: "2026-03-16T05:58:18.088Z",
      timestampEnd: "2026-03-16T05:58:18.106Z",
      durationMs: 18,
      request: {
        method: "POST",
        url: "http://localhost/upload",
        path: "/files/upload",
        query: {},
        headers: {},
        body: {
          kind: "multipart",
          fields: { user: "tester-1" },
          files: [{ fieldName: "file", filename: "some-file.txt", mimeType: "text/plain", sizeBytes: 21 }],
        },
      },
      response: {
        status: 201,
        headers: {},
        body: { kind: "json", value: { id: "file-1", name: "some-file.txt" } },
      },
    },
    {
      id: "chat-bad",
      runId: "run-2",
      stepIndex: 2,
      appAlias: "chatbot",
      timestampStart: "2026-03-16T05:58:25.640Z",
      timestampEnd: "2026-03-16T05:58:25.655Z",
      durationMs: 15,
      request: {
        method: "POST",
        url: "http://localhost/chat-bad",
        path: "/chat-messages",
        query: {},
        headers: {},
        body: { kind: "text", value: "{\"query\":\"What is written in the attached file?\"" },
      },
      response: {
        status: 400,
        headers: {},
        body: { kind: "json", value: { code: "bad_request" } },
      },
    },
    {
      id: "chat-good",
      runId: "run-2",
      stepIndex: 3,
      appAlias: "chatbot",
      timestampStart: "2026-03-16T05:58:37.886Z",
      timestampEnd: "2026-03-16T05:58:44.761Z",
      durationMs: 6875,
      request: {
        method: "POST",
        url: "http://localhost/chat-good",
        path: "/chat-messages",
        query: {},
        headers: {},
        body: {
          kind: "json",
          value: {
            query: "What is written in the attached file?",
            inputs: {},
            response_mode: "blocking",
            conversation_id: "",
            user: "tester-1",
            files: [{ type: "document", transfer_method: "local_file", upload_file_id: "file-1" }],
          },
        },
      },
      response: {
        status: 200,
        headers: {},
        body: {
          kind: "json",
          value: {
            answer: 'It literally contains the JSON array ["hey, you are awesome!"].',
          },
        },
      },
    },
  ];
}

function makeThreeAttemptTrace(): TraceEvent[] {
  return [
    {
      id: "1",
      runId: "run-3",
      stepIndex: 1,
      appAlias: "chatbot",
      timestampStart: "2026-03-11T00:00:00.000Z",
      timestampEnd: "2026-03-11T00:00:00.000Z",
      durationMs: 0,
      request: {
        method: "POST",
        url: "http://localhost/open-bad-1",
        path: "/chat-messages",
        query: {},
        headers: {},
        body: { kind: "json", value: { conversation_id: "wrong" } },
      },
      response: { status: 400, headers: {}, body: { kind: "json", value: {} } },
    },
    {
      id: "2",
      runId: "run-3",
      stepIndex: 2,
      appAlias: "chatbot",
      timestampStart: "2026-03-11T00:00:00.000Z",
      timestampEnd: "2026-03-11T00:00:00.000Z",
      durationMs: 0,
      request: {
        method: "POST",
        url: "http://localhost/open-bad-2",
        path: "/chat-messages",
        query: {},
        headers: {},
        body: { kind: "json", value: { conversation_id: "" } },
      },
      response: { status: 500, headers: {}, body: { kind: "json", value: {} } },
    },
    {
      id: "3",
      runId: "run-3",
      stepIndex: 3,
      appAlias: "chatbot",
      timestampStart: "2026-03-11T00:00:00.000Z",
      timestampEnd: "2026-03-11T00:00:00.000Z",
      durationMs: 0,
      request: {
        method: "POST",
        url: "http://localhost/open-good",
        path: "/chat-messages",
        query: {},
        headers: {},
        body: { kind: "json", value: { conversation_id: "" } },
      },
      response: {
        status: 200,
        headers: {},
        body: { kind: "json", value: { conversation_id: "conv-1", answer: "hello" } },
      },
    },
    {
      id: "4",
      runId: "run-3",
      stepIndex: 4,
      appAlias: "chatbot",
      timestampStart: "2026-03-11T00:00:00.000Z",
      timestampEnd: "2026-03-11T00:00:00.000Z",
      durationMs: 0,
      request: {
        method: "POST",
        url: "http://localhost/continue",
        path: "/chat-messages",
        query: {},
        headers: {},
        body: { kind: "json", value: { conversation_id: "conv-1" } },
      },
      response: { status: 200, headers: {}, body: { kind: "json", value: { answer: "done" } } },
    },
  ];
}

describe("score-run", () => {
  it("scores a correct conversation flow highly", () => {
    const result = scoreRun({
      testCase: simpleCase,
      trace: makeTrace(),
    });
    expect(result.score.breakdown.sequenceScore).toBe(100);
    expect(result.score.breakdown.resultScore).toBe(100);
    expect(result.score.breakdown.conversationStateScore).toBe(100);
    expect(result.score.breakdown.contentScore).toBeUndefined();
    expect(result.score.breakdown.tokenEfficiencyScore).toBeUndefined();
    expect(result.score.weights.sequenceScore).toBe(46.67);
    expect(result.score.weights.resultScore).toBe(33.33);
    expect(result.score.weights.conversationStateScore).toBe(20);
    expect(result.score.weights.contentScore).toBeUndefined();
    expect(result.score.weights.tokenEfficiencyScore).toBeUndefined();
  });

  it("penalizes mismatched conversation reuse", () => {
    const result = scoreRun({
      testCase: simpleCase,
      trace: makeTrace("wrong"),
    });
    expect(result.score.breakdown.conversationStateScore).toBe(0);
  });

  it("ignores setup requests before matching expected steps", () => {
    const result = scoreRun({
      testCase: simpleCase,
      trace: makeTraceWithSetup(),
    });
    expect(result.score.breakdown.sequenceScore).toBe(100);
    expect(result.score.breakdown.resultScore).toBe(100);
    expect(result.score.totalScore).toBe(100);
  });

  it("scores token efficiency when usage and budget are available", () => {
    const result = scoreRun({
      testCase: simpleCase,
      trace: makeTrace(),
      runner: {
        runnerKind: "codex",
        startedAt: "2026-03-11T00:00:00.000Z",
        endedAt: "2026-03-11T00:00:01.000Z",
        durationMs: 1000,
        exitCode: 0,
        status: "completed",
        stdoutPath: "/tmp/stdout.log",
        stderrPath: "/tmp/stderr.log",
        usage: {
          inputTokens: 800,
          outputTokens: 200,
          totalTokens: 1000,
        },
      },
    });

    expect(result.score.breakdown.tokenEfficiencyScore).toBe(100);
    expect(result.score.weights.sequenceScore).toBe(38.89);
    expect(result.score.weights.resultScore).toBe(27.78);
    expect(result.score.weights.conversationStateScore).toBe(16.67);
    expect(result.score.weights.tokenEfficiencyScore).toBe(16.67);
    expect(result.score.totalScore).toBe(100);
  });

  it("penalizes runs that exceed the token budget", () => {
    const result = scoreRun({
      testCase: simpleCase,
      trace: makeTrace(),
      runner: {
        runnerKind: "codex",
        startedAt: "2026-03-11T00:00:00.000Z",
        endedAt: "2026-03-11T00:00:01.000Z",
        durationMs: 1000,
        exitCode: 0,
        status: "completed",
        stdoutPath: "/tmp/stdout.log",
        stderrPath: "/tmp/stderr.log",
        usage: {
          inputTokens: 1600,
          outputTokens: 200,
          totalTokens: 1800,
        },
      },
    });

    expect(result.score.breakdown.tokenEfficiencyScore).toBe(4);
    expect(result.score.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "token_budget_exceeded",
          message: "Token usage 1800 exceeded target budget 1000",
        }),
      ]),
    );
    expect(result.score.totalScore).toBe(84);
  });

  it("drops token efficiency faster once usage crosses the target", () => {
    const scores = [1100, 1500, 1800].map((totalTokens) =>
      scoreRun({
        testCase: simpleCase,
        trace: makeTrace(),
        runner: {
          runnerKind: "codex",
          startedAt: "2026-03-11T00:00:00.000Z",
          endedAt: "2026-03-11T00:00:01.000Z",
          durationMs: 1000,
          exitCode: 0,
          status: "completed",
          stdoutPath: "/tmp/stdout.log",
          stderrPath: "/tmp/stderr.log",
          usage: {
            inputTokens: totalTokens - 200,
            outputTokens: 200,
            totalTokens,
          },
        },
      }).score.breakdown.tokenEfficiencyScore,
    );

    expect(scores).toEqual([81, 25, 4]);
  });

  it("mentions max budget when token usage reaches the hard cap", () => {
    const result = scoreRun({
      testCase: simpleCase,
      trace: makeTrace(),
      runner: {
        runnerKind: "codex",
        startedAt: "2026-03-11T00:00:00.000Z",
        endedAt: "2026-03-11T00:00:01.000Z",
        durationMs: 1000,
        exitCode: 0,
        status: "completed",
        stdoutPath: "/tmp/stdout.log",
        stderrPath: "/tmp/stderr.log",
        usage: {
          inputTokens: 2100,
          outputTokens: 100,
          totalTokens: 2200,
        },
      },
    });

    expect(result.score.breakdown.tokenEfficiencyScore).toBe(0);
    expect(result.score.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "token_budget_exceeded",
          severity: "warn",
          message: "Token usage 2200 exceeded max budget 2000 (target 1000)",
        }),
      ]),
    );
  });

  it("uses per-test-case score weights when provided", () => {
    const weightedCase: EvaluationTestCase = {
      ...simpleCase,
      scoreWeights: {
        sequenceScore: 1,
        resultScore: 3,
        conversationStateScore: 1,
        tokenEfficiencyScore: 0,
      },
    };
    const result = scoreRun({
      testCase: weightedCase,
      trace: makeTrace("wrong"),
    });

    expect(result.score.weights.sequenceScore).toBe(20);
    expect(result.score.weights.resultScore).toBe(60);
    expect(result.score.weights.conversationStateScore).toBe(20);
    expect(result.score.weights.tokenEfficiencyScore).toBeUndefined();
    expect(result.score.totalScore).toBe(50);
  });

  it("uses a successful retry for scoring instead of the first failed attempt", () => {
    const result = scoreRun({
      testCase: uploadCase,
      trace: makeUploadTraceWithRetry(),
    });

    expect(result.variables).toEqual({ uploaded_file_id: "file-1" });
    expect(result.score.breakdown.sequenceScore).toBe(100);
    expect(result.score.breakdown.resultScore).toBe(100);
    expect(result.score.breakdown.contentScore).toBe(100);
    expect(result.score.findings).toEqual([]);
  });

  it("keeps searching across same-route retries until one fully passes", () => {
    const result = scoreRun({
      testCase: simpleCase,
      trace: makeThreeAttemptTrace(),
    });

    expect(result.score.breakdown.sequenceScore).toBe(100);
    expect(result.score.breakdown.resultScore).toBe(100);
    expect(result.score.breakdown.conversationStateScore).toBe(100);
    expect(result.variables).toEqual({ conversation_id: "conv-1" });
    expect(result.score.findings).toEqual([]);
  });

  it("falls back to the best failed candidate when no retry fully passes", () => {
    const result = scoreRun({
      testCase: simpleCase,
      trace: [
        {
          id: "1",
          runId: "run-4",
          stepIndex: 1,
          appAlias: "chatbot",
          timestampStart: "2026-03-11T00:00:00.000Z",
          timestampEnd: "2026-03-11T00:00:00.000Z",
          durationMs: 0,
          request: {
            method: "POST",
            url: "http://localhost/open-bad-1",
            path: "/chat-messages",
            query: {},
            headers: {},
            body: { kind: "json", value: { conversation_id: "wrong" } },
          },
          response: { status: 400, headers: {}, body: { kind: "json", value: {} } },
        },
        {
          id: "2",
          runId: "run-4",
          stepIndex: 2,
          appAlias: "chatbot",
          timestampStart: "2026-03-11T00:00:00.000Z",
          timestampEnd: "2026-03-11T00:00:00.000Z",
          durationMs: 0,
          request: {
            method: "POST",
            url: "http://localhost/open-bad-2",
            path: "/chat-messages",
            query: {},
            headers: {},
            body: { kind: "json", value: { conversation_id: "" } },
          },
          response: { status: 500, headers: {}, body: { kind: "json", value: {} } },
        },
      ],
    });

    expect(result.score.breakdown.sequenceScore).toBe(50);
    expect(result.score.breakdown.resultScore).toBe(0);
    expect(result.score.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "response_rule_failed",
          message: "open response rules failed: json.conversation_id expected non-empty",
        }),
        expect.objectContaining({
          code: "missing_trace_step",
          message: "Missing trace for step continue",
        }),
      ]),
    );
  });
});
