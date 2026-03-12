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

    expect(result.score.breakdown.tokenEfficiencyScore).toBe(36);
    expect(result.score.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "token_budget_exceeded",
          message: "Token usage 1800 exceeded target budget 1000",
        }),
      ]),
    );
    expect(result.score.totalScore).toBe(89.33);
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
});
