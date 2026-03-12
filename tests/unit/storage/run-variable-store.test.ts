import { describe, expect, it } from "vitest";

import { createRunVariableStore } from "@/src/server/storage/run-variable-store";

describe("run-variable-store", () => {
  it("isolates variables by run id", () => {
    const store = createRunVariableStore();
    store.setVariables("run-1", { a: "1" });
    store.setVariables("run-2", { a: "2" });
    expect(store.getVariables("run-1")).toEqual({ a: "1" });
    expect(store.getVariables("run-2")).toEqual({ a: "2" });
  });
});
