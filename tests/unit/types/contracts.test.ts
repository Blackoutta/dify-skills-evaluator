import { describe, expect, it } from "vitest";

import {
  validateEvaluationTestCase,
  validateStartEvaluationInput,
} from "@/src/server/types/contracts";

describe("contracts", () => {
  it("validates a correct test case", () => {
    const result = validateEvaluationTestCase({
      id: "case-1",
      title: "Case 1",
      appType: "chatflow",
      requiredApps: [{ appAlias: "chatbot", appType: "chatflow", purpose: "chat" }],
      objective: "Test",
      promptForAgent: "Run it",
      maxTurns: 2,
      tokenBudget: {
        targetTotalTokens: 1000,
        maxTotalTokens: 1500,
      },
      expectedTrace: {
        steps: [
          {
            stepId: "step-1",
            order: 1,
            appAlias: "chatbot",
            method: "POST",
            path: "/chat-messages",
          },
        ],
      },
      assertions: [{ id: "a", description: "desc", type: "minimum_trace_steps" }],
    });

    expect(result.id).toBe("case-1");
  });

  it("rejects duplicate step ids", () => {
    expect(() =>
      validateEvaluationTestCase({
        id: "case-1",
        title: "Case 1",
        appType: "chatflow",
        requiredApps: [{ appAlias: "chatbot", appType: "chatflow", purpose: "chat" }],
        objective: "Test",
        promptForAgent: "Run it",
        maxTurns: 2,
        expectedTrace: {
          steps: [
            { stepId: "dup", order: 1, appAlias: "chatbot", method: "POST", path: "/chat-messages" },
            { stepId: "dup", order: 2, appAlias: "chatbot", method: "POST", path: "/chat-messages" },
          ],
        },
        assertions: [{ id: "a", description: "desc", type: "minimum_trace_steps" }],
      }),
    ).toThrow(/Duplicate stepId/);
  });

  it("rejects duplicate app aliases in start input", () => {
    expect(() =>
      validateStartEvaluationInput({
        runnerKind: "codex",
        skillPath: "/tmp/skill",
        testCaseId: "case-1",
        appBindings: [
          { appAlias: "chatbot", appType: "chatflow", realDifyBaseUrl: "http://a", apiKey: "k1" },
          { appAlias: "chatbot", appType: "chatflow", realDifyBaseUrl: "http://b", apiKey: "k2" },
        ],
      }),
    ).toThrow(/Duplicate appAlias/);
  });

  it("rejects token budgets where max is below target", () => {
    expect(() =>
      validateEvaluationTestCase({
        id: "case-1",
        title: "Case 1",
        appType: "chatflow",
        requiredApps: [{ appAlias: "chatbot", appType: "chatflow", purpose: "chat" }],
        objective: "Test",
        promptForAgent: "Run it",
        maxTurns: 2,
        tokenBudget: {
          targetTotalTokens: 1000,
          maxTotalTokens: 999,
        },
        expectedTrace: {
          steps: [
            { stepId: "step-1", order: 1, appAlias: "chatbot", method: "POST", path: "/chat-messages" },
          ],
        },
        assertions: [{ id: "a", description: "desc", type: "minimum_trace_steps" }],
      }),
    ).toThrow(/tokenBudget.maxTotalTokens/);
  });
});
