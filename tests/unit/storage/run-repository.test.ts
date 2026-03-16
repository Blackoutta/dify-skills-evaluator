import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRunRepository } from "@/src/server/storage/run-repository";

describe("run-repository", () => {
  it("writes and reads run artifacts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    const repo = createRunRepository(root);

    repo.writeTrace("run-1", []);
    repo.writeScore("run-1", {
      totalScore: 100,
      breakdown: {
        sequenceScore: 100,
        resultScore: 100,
        conversationStateScore: 100,
      },
      weights: {
        sequenceScore: 47.06,
        resultScore: 29.41,
        conversationStateScore: 23.53,
      },
      findings: [],
    });
    repo.writeVariables("run-1", { conversation_id: "conv-1" });

    expect(repo.readTrace("run-1")).toEqual([]);
  });

  it("appends trace events", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    const repo = createRunRepository(root);
    repo.appendTraceEvent("run-1", {
      id: "t1",
      runId: "run-1",
      stepIndex: 1,
      appAlias: "chatbot",
      timestampStart: "",
      timestampEnd: "",
      durationMs: 0,
      request: { method: "POST", url: "", path: "/chat-messages", query: {}, headers: {} },
      response: { status: 200, headers: {} },
    });
    expect(repo.readTrace("run-1")).toHaveLength(1);
  });

  it("reads progress logs as ordered lines", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    const repo = createRunRepository(root);

    repo.appendProgressLog("run-1", "[2026-03-12T00:00:00.000Z] Run queued");
    repo.appendProgressLog("run-1", "[2026-03-12T00:00:01.000Z] Run started");

    expect(repo.readProgressLogLines("run-1")).toEqual([
      "[2026-03-12T00:00:00.000Z] Run queued",
      "[2026-03-12T00:00:01.000Z] Run started",
    ]);
  });

  it("deletes a persisted run directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    const repo = createRunRepository(root);

    repo.appendProgressLog("run-1", "[2026-03-12T00:00:00.000Z] Run queued");

    expect(repo.deleteRun("run-1")).toBe(true);
    expect(repo.readRunResult("run-1")).toBeNull();
    expect(fs.existsSync(path.join(root, "run-1"))).toBe(false);
  });
});
