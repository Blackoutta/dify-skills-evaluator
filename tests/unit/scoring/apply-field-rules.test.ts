import { describe, expect, it } from "vitest";

import { applyFieldRules, getValueAtPath } from "@/src/server/scoring/apply-field-rules";

describe("apply-field-rules", () => {
  it("reads nested json and array paths", () => {
    const body = {
      kind: "json" as const,
      value: { files: [{ upload_file_id: "file-1" }] },
    };
    expect(getValueAtPath(body, "json.files[0].upload_file_id")).toBe("file-1");
  });

  it("passes mixed rule sets", () => {
    const result = applyFieldRules(
      { kind: "json", value: { answer: "employee-handbook.pdf", response_mode: "blocking" } },
      [
        { path: "json.response_mode", rule: "equals", value: "blocking" },
        { path: "json.answer", rule: "contains", value: "employee" },
      ],
      {},
    );
    expect(result.passed).toBe(true);
  });

  it("fails when variable is missing", () => {
    const result = applyFieldRules(
      { kind: "json", value: { conversation_id: "abc" } },
      [{ path: "json.conversation_id", rule: "equals_variable", variableName: "conversation_id" }],
      {},
    );
    expect(result.passed).toBe(false);
  });
});
