import { getTraceProxyService } from "@/src/server/runtime";

export const runtime = "nodejs";

async function handle(
  request: Request,
  context: { params: Promise<{ runId: string; appAlias: string; path: string[] }> },
) {
  const { runId, appAlias, path } = await context.params;
  return getTraceProxyService().handle(request, { runId, appAlias, path });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string; appAlias: string; path: string[] }> },
) {
  return handle(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string; appAlias: string; path: string[] }> },
) {
  return handle(request, context);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ runId: string; appAlias: string; path: string[] }> },
) {
  return handle(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ runId: string; appAlias: string; path: string[] }> },
) {
  return handle(request, context);
}
