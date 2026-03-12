import { describe, expect, it } from "vitest";

import {
  normalizeFormData,
  normalizeRequestBody,
  normalizeResponseBody,
} from "@/src/server/proxy/normalize-body";

describe("normalize-body", () => {
  it("normalizes json request bodies", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    const result = await normalizeRequestBody(request);

    expect(result.body).toEqual({ kind: "json", value: { hello: "world" } });
  });

  it("normalizes multipart form data", () => {
    const formData = new FormData();
    formData.set("user", "eval-user");
    formData.set("file", new File(["hello"], "sample.txt", { type: "text/plain" }));

    const result = normalizeFormData(formData);

    expect(result.kind).toBe("multipart");
    if (result.kind !== "multipart") {
      throw new Error("Expected multipart body");
    }
    expect(result.fields.user).toBe("eval-user");
    expect(result.files[0].filename).toBe("sample.txt");
  });

  it("normalizes response json bodies", async () => {
    const response = new Response(JSON.stringify({ id: "abc" }), {
      headers: { "content-type": "application/json" },
    });
    const result = await normalizeResponseBody(response);
    expect(result.body).toEqual({ kind: "json", value: { id: "abc" } });
  });
});
