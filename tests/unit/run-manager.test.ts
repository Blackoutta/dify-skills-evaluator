import { describe, expect, it } from "vitest";

import { RunManager, type RunSession } from "@/src/server/run-manager";

describe("run-manager", () => {
  it("lists only active sessions sorted by newest update and returns defensive copies", () => {
    const manager = new RunManager({} as never, {} as never);
    const sessions = (manager as unknown as { sessions: Map<string, RunSession> }).sessions;

    sessions.set("run-queued", {
      runId: "run-queued",
      testCaseId: "case-queued",
      status: "queued",
      createdAt: "2026-03-12T01:00:00.000Z",
      updatedAt: "2026-03-12T01:03:00.000Z",
      logs: [],
    });
    sessions.set("run-running", {
      runId: "run-running",
      testCaseId: "case-running",
      status: "running",
      createdAt: "2026-03-12T01:01:00.000Z",
      updatedAt: "2026-03-12T01:04:00.000Z",
      logs: [],
    });
    sessions.set("run-completed", {
      runId: "run-completed",
      testCaseId: "case-completed",
      status: "completed",
      createdAt: "2026-03-12T01:02:00.000Z",
      updatedAt: "2026-03-12T01:05:00.000Z",
      logs: [],
    });

    const active = manager.listActiveSessions();

    expect(active).toEqual([
      {
        runId: "run-running",
        testCaseId: "case-running",
        status: "running",
        createdAt: "2026-03-12T01:01:00.000Z",
        updatedAt: "2026-03-12T01:04:00.000Z",
      },
      {
        runId: "run-queued",
        testCaseId: "case-queued",
        status: "queued",
        createdAt: "2026-03-12T01:00:00.000Z",
        updatedAt: "2026-03-12T01:03:00.000Z",
      },
    ]);

    active[0]!.updatedAt = "mutated";

    expect(manager.listActiveSessions()[0]?.updatedAt).toBe("2026-03-12T01:04:00.000Z");
  });
});
