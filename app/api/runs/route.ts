import { NextResponse } from "next/server";

import { getRunManager, getRunRepository } from "@/src/server/runtime";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getRunRepository().listRuns());
}

export async function POST(request: Request) {
  const payload = (await request.json()) as unknown;
  try {
    const session = getRunManager().start(payload as never);
    return NextResponse.json(session, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown_error" },
      { status: 400 },
    );
  }
}
