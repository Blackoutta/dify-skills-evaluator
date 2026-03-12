import { NextResponse } from "next/server";

import { getRunManager, getRunRepository } from "@/src/server/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const session = getRunManager().get(runId);
  if (session) {
    return NextResponse.json(session);
  }

  const result = getRunRepository().readRunResult(runId);
  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    runId,
    testCaseId: result.testCaseId,
    status: result.status,
    createdAt: result.createdAt,
    updatedAt: result.runner.endedAt,
    logs: getRunRepository().readProgressLogLines(runId),
    result,
  });
}
