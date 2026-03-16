import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { CaseRepository } from "@/src/server/cases/case-repository";
import { EvaluatorOrchestrator } from "@/src/server/orchestrator/evaluator-orchestrator";
import type { AgentRunner } from "@/src/server/runners/agent-runner";
import { createRunRepository } from "@/src/server/storage/run-repository";
import { createRunSecretStore } from "@/src/server/storage/run-secret-store";
import { createRunVariableStore } from "@/src/server/storage/run-variable-store";
import type { EvaluationTestCase } from "@/src/server/types/contracts";

const testCase: EvaluationTestCase = {
  id: "case-1",
  title: "Case 1",
  appType: "chatflow",
  requiredApps: [{ appAlias: "chatbot", appType: "chatflow", purpose: "chat" }],
  objective: "Test",
  promptForAgent: "Run it",
  maxTurns: 2,
  tokenBudget: {
    targetTotalTokens: 1000,
    maxTotalTokens: 2000,
  },
  expectedTrace: {
    steps: [
      {
        stepId: "step-1",
        order: 1,
        appAlias: "chatbot",
        method: "POST",
        path: "/chat-messages",
        responseExtractors: [{ variableName: "conversation_id", fromPath: "json.conversation_id" }],
      },
    ],
  },
  assertions: [],
};

describe("evaluator-orchestrator", () => {
  it("runs a happy path and persists result", async () => {
    const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runs-"));
    const repo = createRunRepository(runsRoot);
    const runner: AgentRunner = {
      kind: "codex",
      async run() {
        repo.writeTrace("run-1", [
          {
            id: "t1",
            runId: "run-1",
            stepIndex: 1,
            appAlias: "chatbot",
            timestampStart: "",
            timestampEnd: "",
            durationMs: 0,
            request: { method: "POST", url: "", path: "/chat-messages", query: {}, headers: {} },
            response: {
              status: 200,
              headers: {},
              body: { kind: "json", value: { conversation_id: "conv-1" } },
            },
          },
        ]);
        return {
          runnerKind: "codex",
          startedAt: "2026-03-11T00:00:00.000Z",
          endedAt: "2026-03-11T00:00:01.000Z",
          durationMs: 1000,
          exitCode: 0,
          status: "completed",
          stdoutPath: path.join(runsRoot, "run-1", "runner-output.log"),
          stderrPath: path.join(runsRoot, "run-1", "runner-error.log"),
          usage: {
            inputTokens: 700,
            outputTokens: 200,
            totalTokens: 900,
          },
        };
      },
    };
    const caseRepository: CaseRepository = {
      listCases: () => [testCase],
      getCaseById: () => testCase,
    };

    const orchestrator = new EvaluatorOrchestrator({
      caseRepository,
      runner,
      repository: repo,
      secretStore: createRunSecretStore(),
      variableStore: createRunVariableStore(),
      config: {
        proxyPort: 3000,
        runnerTimeoutMs: 1000,
        artifactRoot: process.cwd(),
        runsRoot,
      },
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      idFactory: () => "run-1",
    });

    const result = await orchestrator.run({
      runnerKind: "codex",
      skillPath: "/tmp/skill",
      testCaseId: "case-1",
      appBindings: [
        {
          appAlias: "chatbot",
          appType: "chatflow",
          realDifyBaseUrl: "http://example.com",
          apiKey: "secret",
        },
      ],
    });

    expect(result.runId).toBe("run-1");
    expect(result.skillPath).toBe("/tmp/skill");
    expect(repo.readRunResult("run-1")?.skillPath).toBe("/tmp/skill");
    expect(repo.readRunResult("run-1")?.score.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.runner.usage?.totalTokens).toBe(900);
    expect(result.score.breakdown.tokenEfficiencyScore).toBe(100);
  });

  it("rejects missing required app bindings", async () => {
    const orchestrator = new EvaluatorOrchestrator({
      caseRepository: { listCases: () => [testCase], getCaseById: () => testCase },
      runner: { kind: "codex", run: async () => { throw new Error("should not run"); } },
      repository: createRunRepository(fs.mkdtempSync(path.join(os.tmpdir(), "runs-"))),
      secretStore: createRunSecretStore(),
      variableStore: createRunVariableStore(),
      config: {
        proxyPort: 3000,
        runnerTimeoutMs: 1000,
        artifactRoot: process.cwd(),
        runsRoot: fs.mkdtempSync(path.join(os.tmpdir(), "runs-")),
      },
    });

    await expect(
      orchestrator.run({
        runnerKind: "codex",
        skillPath: "/tmp/skill",
        testCaseId: "case-1",
        appBindings: [
          {
            appAlias: "other-app",
            appType: "chatflow",
            realDifyBaseUrl: "http://example.com",
            apiKey: "secret",
          },
        ],
      }),
    ).rejects.toThrow(/Missing app bindings/);
  });

  it("injects localhost into runner no_proxy env", async () => {
    const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runs-"));
    const repo = createRunRepository(runsRoot);
    let capturedEnv: Record<string, string> | undefined;
    let capturedWorkspaceRoot: string | undefined;
    const runner: AgentRunner = {
      kind: "codex",
      async run(input) {
        capturedEnv = input.env;
        capturedWorkspaceRoot = input.workspaceRoot;
        return {
          runnerKind: "codex",
          startedAt: "2026-03-11T00:00:00.000Z",
          endedAt: "2026-03-11T00:00:01.000Z",
          durationMs: 1000,
          exitCode: 0,
          status: "completed",
          stdoutPath: path.join(runsRoot, "run-1", "runner-output.log"),
          stderrPath: path.join(runsRoot, "run-1", "runner-error.log"),
          usage: {
            totalTokens: 1000,
          },
        };
      },
    };

    const orchestrator = new EvaluatorOrchestrator({
      caseRepository: { listCases: () => [testCase], getCaseById: () => testCase },
      runner,
      repository: repo,
      secretStore: createRunSecretStore(),
      variableStore: createRunVariableStore(),
      config: {
        proxyPort: 3000,
        runnerTimeoutMs: 1000,
        artifactRoot: process.cwd(),
        runsRoot,
      },
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      idFactory: () => "run-1",
    });

    await orchestrator.run({
      runnerKind: "codex",
      skillPath: "/tmp/skill",
      testCaseId: "case-1",
      appBindings: [
        {
          appAlias: "chatbot",
          appType: "chatflow",
          realDifyBaseUrl: "http://example.com",
          apiKey: "secret",
        },
      ],
    });

    expect(capturedEnv?.NO_PROXY).toContain("localhost");
    expect(capturedEnv?.NO_PROXY).toContain("127.0.0.1");
    expect(capturedEnv?.no_proxy).toBe(capturedEnv?.NO_PROXY);
    expect(capturedEnv?.DIFY_BASE_URL).toBe(
      "http://127.0.0.1:3000/api/runs/run-1/apps/chatbot/proxy",
    );
    expect(capturedEnv?.DIFY_API_KEY).toBe("evaluator-proxy-token");
    expect(capturedEnv?.DIFY_USER).toBe("eval-user");
    expect(capturedEnv?.DIFY_APP_BASE_URL_CHATBOT).toBe(
      "http://127.0.0.1:3000/api/runs/run-1/apps/chatbot/proxy",
    );
    expect(capturedWorkspaceRoot).toBe(process.cwd());
  });
});
