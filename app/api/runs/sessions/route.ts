import { NextResponse } from "next/server";

import { getRunManager, getRunRepository } from "@/src/server/runtime";
import type { SessionListEntry } from "@/src/server/types/contracts";

export const runtime = "nodejs";

export async function GET() {
  const activeSessions = getRunManager().listActiveSessions();
  const activeRunIds = new Set(activeSessions.map((session) => session.runId));
  const persistedRuns = getRunRepository().listRuns();

  const sessions: SessionListEntry[] = [
    ...activeSessions.map((session) => ({
      runId: session.runId,
      testCaseId: session.testCaseId,
      skillPath: session.skillPath,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isActive: true,
    })),
    ...persistedRuns
      .filter((run) => !activeRunIds.has(run.runId))
      .map((run) => ({
        runId: run.runId,
        testCaseId: run.testCaseId,
        skillPath: run.skillPath,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.runner.endedAt,
        isActive: false,
        result: run,
      })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json(sessions);
}
