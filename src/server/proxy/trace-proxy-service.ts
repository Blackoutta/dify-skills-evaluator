import { normalizeRequestBody, normalizeResponseBody } from "@/src/server/proxy/normalize-body";
import type { RunRepository } from "@/src/server/storage/run-repository";
import type { RunSecretStore } from "@/src/server/storage/run-secret-store";
import type { HttpMethod, TraceEvent } from "@/src/server/types/contracts";
import { redactHeaders } from "@/src/server/utils/redact";

function toHeaderRecord(headers: Headers): Record<string, string> {
  const allowlist = new Set(["content-type", "authorization", "user-agent"]);
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (allowlist.has(key.toLowerCase())) {
      result[key] = value;
    }
  });
  return redactHeaders(result);
}

function buildTargetUrl(baseUrl: string, pathname: string, search: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${suffix}${search}`;
}

export interface TraceProxyServiceDeps {
  secretStore: RunSecretStore;
  repository: RunRepository;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  idFactory?: () => string;
}

export class TraceProxyService {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly deps: TraceProxyServiceDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? (() => new Date());
    this.idFactory = deps.idFactory ?? (() => crypto.randomUUID());
  }

  async handle(request: Request, params: { runId: string; appAlias: string; path: string[] }): Promise<Response> {
    const binding = this.deps.secretStore.getBinding(params.runId, params.appAlias);
    if (!binding) {
      return Response.json({ error: "binding_not_found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const forwardPath = `/${params.path.join("/")}`;
    const targetUrl = buildTargetUrl(binding.realDifyBaseUrl, forwardPath, url.search);

    const requestNormalization = await normalizeRequestBody(request);
    const requestBodyBuffer =
      request.method === "GET" || request.method === "DELETE"
        ? undefined
        : await request.arrayBuffer();

    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.set("authorization", `Bearer ${binding.apiKey}`);
    upstreamHeaders.delete("host");
    upstreamHeaders.delete("content-length");

    const startedAt = this.now();
    const upstreamResponse = await this.fetchImpl(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: requestBodyBuffer,
    });
    const responseNormalization = await normalizeResponseBody(upstreamResponse);
    const responseBodyText = responseNormalization.rawBody ?? "";
    const endedAt = this.now();

    const trace = this.buildTraceEvent({
      runId: params.runId,
      appAlias: params.appAlias,
      forwardPath,
      request,
      requestNormalization,
      response: upstreamResponse,
      responseNormalization,
      startedAt,
      endedAt,
    });
    this.deps.repository.appendTraceEvent(params.runId, trace);

    return new Response(responseBodyText, {
      status: upstreamResponse.status,
      headers: upstreamResponse.headers,
    });
  }

  private buildTraceEvent(input: {
    runId: string;
    appAlias: string;
    forwardPath: string;
    request: Request;
    requestNormalization: Awaited<ReturnType<typeof normalizeRequestBody>>;
    response: Response;
    responseNormalization: Awaited<ReturnType<typeof normalizeResponseBody>>;
    startedAt: Date;
    endedAt: Date;
  }): TraceEvent {
    const url = new URL(input.request.url);
    const nextStepIndex = this.deps.repository.readTrace(input.runId).length + 1;
    const query: Record<string, string | string[]> = {};
    url.searchParams.forEach((value, key) => {
      const existing = query[key];
      if (existing === undefined) {
        query[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        query[key] = [existing, value];
      }
    });

    return {
      id: this.idFactory(),
      runId: input.runId,
      stepIndex: nextStepIndex,
      appAlias: input.appAlias,
      timestampStart: input.startedAt.toISOString(),
      timestampEnd: input.endedAt.toISOString(),
      durationMs: input.endedAt.getTime() - input.startedAt.getTime(),
      request: {
        method: input.request.method as HttpMethod,
        url: input.request.url,
        path: input.forwardPath,
        query,
        headers: toHeaderRecord(input.request.headers),
        body: input.requestNormalization.body,
        rawBody: input.requestNormalization.rawBody,
      },
      response: {
        status: input.response.status,
        headers: toHeaderRecord(input.response.headers),
        body: input.responseNormalization.body,
        rawBody: input.responseNormalization.rawBody,
      },
    };
  }
}
