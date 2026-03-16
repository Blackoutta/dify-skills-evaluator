import { describe, expect, it, vi } from "vitest";

import { buildCodexPrompt, CodexRunner, extractCodexUsage } from "@/src/server/runners/codex-runner";
import type { RunnerExecutionInput } from "@/src/server/types/contracts";

const input: RunnerExecutionInput = {
  skillPath: "/tmp/skill",
  workspaceRoot: "/tmp/workspace",
  testCase: {
    id: "case-1",
    title: "Case 1",
    appType: "chatflow",
    requiredApps: [{ appAlias: "chatbot", appType: "chatflow", purpose: "chat" }],
    objective: "Test",
    promptForAgent: "Run it",
    maxTurns: 1,
    expectedTrace: { steps: [] },
    assertions: [],
  },
  env: {
    EVAL_RUN_ID: "run-1",
    DIFY_API_KEY: "evaluator-proxy-token",
    DIFY_BASE_URL: "http://localhost:3000/api/runs/run-1/apps/chatbot/proxy",
    DIFY_USER: "eval-user",
    DIFY_APP_USER: "eval-user",
    DIFY_APP_BASE_URL_CHATBOT: "http://localhost:3000/api/runs/run-1/apps/chatbot/proxy",
  },
  artifactBindings: [{ artifactId: "source_doc", absolutePath: "/tmp/file.pdf" }],
  workingDirectory: "/tmp/run-1",
  timeoutMs: 1000,
};

describe("codex-runner", () => {
  it("builds a prompt with aliases and artifacts", () => {
    const prompt = buildCodexPrompt(input);
    expect(prompt).toContain("/tmp/skill");
    expect(prompt).toContain("Only use that exact skill path for this run.");
    expect(prompt).toContain("prefer those over inventing alternate transport or auth setup");
    expect(prompt).toContain("/tmp/workspace");
    expect(prompt).toContain("chatbot");
    expect(prompt).toContain("/tmp/file.pdf");
  });

  it("marks timed out command executions", async () => {
    const executeCommand = vi.fn(async () => ({
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: true,
    }));
    const runner = new CodexRunner({
      executeCommand,
      now: () => new Date("2026-03-11T00:00:00.000Z"),
    });

    const result = await runner.run(input);
    expect(result.status).toBe("timed_out");
    expect(executeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "codex",
        args: [
          "exec",
          "--dangerously-bypass-approvals-and-sandbox",
          "--json",
          "--cd",
          "/tmp/workspace",
          expect.any(String),
        ],
      }),
    );
  });

  it("forwards stdout and stderr chunks to callbacks", async () => {
    const onStdout = vi.fn();
    const onStderr = vi.fn();
    const runner = new CodexRunner({
      executeCommand: vi.fn(async ({ onStdout: stdoutCb, onStderr: stderrCb }) => {
        stdoutCb?.("hello from stdout\n");
        stderrCb?.("hello from stderr\n");
        return {
          exitCode: 0,
          stdout: "hello from stdout\n",
          stderr: "hello from stderr\n",
          timedOut: false,
        };
      }),
      now: () => new Date("2026-03-11T00:00:00.000Z"),
    });

    const result = await runner.run({
      ...input,
      onStdout,
      onStderr,
    });

    expect(result.status).toBe("completed");
    expect(onStdout).toHaveBeenCalledWith("hello from stdout\n");
    expect(onStderr).toHaveBeenCalledWith("hello from stderr\n");
  });

  it("extracts token usage from codex json output", () => {
    const usage = extractCodexUsage([
      "{\"type\":\"thread.started\"}",
      "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1200,\"cached_input_tokens\":900,\"output_tokens\":80}}",
    ].join("\n"));

    expect(usage).toEqual({
      inputTokens: 1200,
      cachedInputTokens: 900,
      outputTokens: 80,
      totalTokens: 1280,
    });
  });
});
