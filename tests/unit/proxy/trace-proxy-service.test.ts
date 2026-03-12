import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { TraceProxyService } from "@/src/server/proxy/trace-proxy-service";
import { createRunRepository } from "@/src/server/storage/run-repository";
import { createRunSecretStore } from "@/src/server/storage/run-secret-store";

describe("trace-proxy-service", () => {
  it("injects auth, forwards request, and records trace", async () => {
    const secretStore = createRunSecretStore();
    secretStore.setRunBindings("run-1", [
      {
        appAlias: "chatbot",
        appType: "chatflow",
        realDifyBaseUrl: "https://api.example.com/v1",
        apiKey: "secret-key",
      },
    ]);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    const repository = createRunRepository(root);
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.example.com/v1/chat-messages");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret-key");
      return new Response(JSON.stringify({ conversation_id: "conv-1", answer: "hi" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const service = new TraceProxyService({
      secretStore,
      repository,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      idFactory: () => "trace-1",
    });

    const response = await service.handle(
      new Request("http://localhost:3000/api/runs/run-1/apps/chatbot/proxy/chat-messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer should-be-redacted",
        },
        body: JSON.stringify({ query: "hi" }),
      }),
      { runId: "run-1", appAlias: "chatbot", path: ["chat-messages"] },
    );

    expect(response.status).toBe(200);
    const trace = repository.readTrace("run-1");
    expect(trace).toHaveLength(1);
    expect(trace[0].appAlias).toBe("chatbot");
    expect(trace[0].request.path).toBe("/chat-messages");
    expect(trace[0].request.headers.authorization).not.toBe("Bearer should-be-redacted");
  });

  it("returns 404 when binding is missing", async () => {
    const service = new TraceProxyService({
      secretStore: createRunSecretStore(),
      repository: createRunRepository(fs.mkdtempSync(path.join(os.tmpdir(), "repo-"))),
    });

    const response = await service.handle(
      new Request("http://localhost/proxy/chat-messages", { method: "POST" }),
      { runId: "missing", appAlias: "chatbot", path: ["chat-messages"] },
    );

    expect(response.status).toBe(404);
  });
});
