import { NextResponse } from "next/server";

import { getRunManager } from "@/src/server/runtime";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getRunManager().listActiveSessions());
}
