import { describe, expect, it, vi } from "vitest";

const getRunManager = vi.fn();
const getRunRepository = vi.fn();

vi.mock("@/src/server/runtime", () => ({
  getRunManager,
  getRunRepository,
}));

describe("run route", () => {
  it("deletes a finished run", async () => {
    getRunManager.mockReturnValue({
      get: vi.fn().mockReturnValue({
        runId: "run-1",
        status: "completed",
      }),
      deleteFinishedSession: vi.fn().mockReturnValue(true),
    });
    getRunRepository.mockReturnValue({
      deleteRun: vi.fn().mockReturnValue(true),
    });

    const { DELETE } = await import("@/app/api/runs/[runId]/route");
    const response = await DELETE(new Request("http://localhost/api/runs/run-1"), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(response.status).toBe(204);
  });

  it("rejects deleting an active run", async () => {
    getRunManager.mockReturnValue({
      get: vi.fn().mockReturnValue({
        runId: "run-1",
        status: "running",
      }),
      deleteFinishedSession: vi.fn(),
    });
    getRunRepository.mockReturnValue({
      deleteRun: vi.fn(),
    });

    const { DELETE } = await import("@/app/api/runs/[runId]/route");
    const response = await DELETE(new Request("http://localhost/api/runs/run-1"), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "active_run_cannot_be_deleted",
    });
  });
});
