import { NextResponse } from "next/server";

import { getRunManager, getRunRepository } from "@/src/server/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const result = getRunRepository().readRunResult(runId);
  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const runManager = getRunManager();
  const repository = getRunRepository();
  const session = runManager.get(runId);

  if (session && (session.status === "queued" || session.status === "running")) {
    return NextResponse.json(
      { error: "active_run_cannot_be_deleted" },
      { status: 409 },
    );
  }

  const deletedSession = runManager.deleteFinishedSession(runId);
  const deletedRun = repository.deleteRun(runId);
  if (!deletedSession && !deletedRun) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
