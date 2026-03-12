import { describe, expect, it } from "vitest";

import { createRunSecretStore } from "@/src/server/storage/run-secret-store";

describe("run-secret-store", () => {
  it("stores and retrieves bindings by run and alias", () => {
    const store = createRunSecretStore();
    store.setRunBindings("run-1", [
      {
        appAlias: "chatbot",
        appType: "chatflow",
        realDifyBaseUrl: "http://example.com",
        apiKey: "secret",
      },
    ]);

    expect(store.getBinding("run-1", "chatbot")?.apiKey).toBe("secret");
    expect(store.getBinding("run-1", "missing")).toBeUndefined();
  });
});
