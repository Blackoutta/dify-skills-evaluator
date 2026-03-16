import { describe, expect, it, vi } from "vitest";

const getRunManager = vi.fn();
const getRunRepository = vi.fn();

vi.mock("@/src/server/runtime", () => ({
  getRunManager,
  getRunRepository,
}));

describe("sessions route", () => {
  it("returns active sessions and finished runs without duplicating active run ids", async () => {
    getRunManager.mockReturnValue({
      listActiveSessions: vi.fn().mockReturnValue([
        {
          runId: "run-active",
          testCaseId: "case-active",
          skillPath: "/tmp/skill-active",
          status: "running",
          createdAt: "2026-03-12T01:01:00.000Z",
          updatedAt: "2026-03-12T01:04:00.000Z",
        },
      ]),
    });
    getRunRepository.mockReturnValue({
      listRuns: vi.fn().mockReturnValue([
        {
          runId: "run-finished",
          testCaseId: "case-finished",
          skillPath: "/tmp/skill-finished",
          status: "completed",
          createdAt: "2026-03-12T01:02:00.000Z",
          runner: {
            endedAt: "2026-03-12T01:03:00.000Z",
          },
          score: {
            totalScore: 92,
          },
        },
        {
          runId: "run-active",
          testCaseId: "case-active",
          skillPath: "/tmp/skill-active-old",
          status: "completed",
          createdAt: "2026-03-12T01:00:00.000Z",
          runner: {
            endedAt: "2026-03-12T01:01:00.000Z",
          },
          score: {
            totalScore: 75,
          },
        },
      ]),
    });

    const { GET } = await import("@/app/api/runs/sessions/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        runId: "run-finished",
        testCaseId: "case-finished",
        skillPath: "/tmp/skill-finished",
        status: "completed",
        createdAt: "2026-03-12T01:02:00.000Z",
        updatedAt: "2026-03-12T01:03:00.000Z",
        isActive: false,
        result: expect.objectContaining({
          runId: "run-finished",
          status: "completed",
        }),
      },
      {
        runId: "run-active",
        testCaseId: "case-active",
        skillPath: "/tmp/skill-active",
        status: "running",
        createdAt: "2026-03-12T01:01:00.000Z",
        updatedAt: "2026-03-12T01:04:00.000Z",
        isActive: true,
      },
    ]);
  });

  it("sorts entries by createdAt descending and marks active rows", async () => {
    getRunManager.mockReturnValue({
      listActiveSessions: vi.fn().mockReturnValue([
        {
          runId: "run-queued",
          testCaseId: "case-queued",
          skillPath: "/tmp/skill-queued",
          status: "queued",
          createdAt: "2026-03-12T01:05:00.000Z",
          updatedAt: "2026-03-12T01:05:30.000Z",
        },
      ]),
    });
    getRunRepository.mockReturnValue({
      listRuns: vi.fn().mockReturnValue([
        {
          runId: "run-completed",
          testCaseId: "case-completed",
          skillPath: "/tmp/skill-completed",
          status: "completed",
          createdAt: "2026-03-12T01:01:00.000Z",
          runner: {
            endedAt: "2026-03-12T01:02:00.000Z",
          },
          score: {
            totalScore: 88,
          },
        },
      ]),
    });

    const { GET } = await import("@/app/api/runs/sessions/route");
    const response = await GET();
    const data = (await response.json()) as Array<{ runId: string; isActive: boolean }>;

    expect(data.map((item) => item.runId)).toEqual(["run-queued", "run-completed"]);
    expect(data.map((item) => item.isActive)).toEqual([true, false]);
  });
});
