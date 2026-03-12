import { describe, expect, it, vi } from "vitest";

const getRunManager = vi.fn();
const getRunRepository = vi.fn();

vi.mock("@/src/server/runtime", () => ({
  getRunManager,
  getRunRepository,
}));

describe("live run route", () => {
  it("falls back to persisted progress log lines when the in-memory session is gone", async () => {
    getRunManager.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    });
    getRunRepository.mockReturnValue({
      readRunResult: vi.fn().mockReturnValue({
        runId: "run-1",
        testCaseId: "case-1",
        status: "completed",
        createdAt: "2026-03-12T00:00:00.000Z",
        runner: {
          endedAt: "2026-03-12T00:01:00.000Z",
        },
      }),
      readProgressLogLines: vi
        .fn()
        .mockReturnValue(["[2026-03-12T00:00:00.000Z] Run queued", "[2026-03-12T00:00:01.000Z] Run started"]),
    });

    const { GET } = await import("@/app/api/runs/[runId]/live/route");
    const response = await GET(new Request("http://localhost/api/runs/run-1/live"), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId: "run-1",
      testCaseId: "case-1",
      status: "completed",
      logs: ["[2026-03-12T00:00:00.000Z] Run queued", "[2026-03-12T00:00:01.000Z] Run started"],
    });
  });
});
