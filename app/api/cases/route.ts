import { NextResponse } from "next/server";

import { getCaseRepository } from "@/src/server/cases/case-repository";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getCaseRepository().listCases());
}
