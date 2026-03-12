import { describe, expect, it } from "vitest";

import { extractVariables } from "@/src/server/scoring/extract-variables";

describe("extract-variables", () => {
  it("extracts multiple values", () => {
    const result = extractVariables(
      { kind: "json", value: { id: "file-1", name: "employee-handbook.pdf" } },
      [
        { variableName: "uploaded_file_id", fromPath: "json.id" },
        { variableName: "uploaded_file_name", fromPath: "json.name" },
      ],
    );

    expect(result.variables).toEqual({
      uploaded_file_id: "file-1",
      uploaded_file_name: "employee-handbook.pdf",
    });
  });

  it("reports missing extraction paths", () => {
    const result = extractVariables(
      { kind: "json", value: { id: "file-1" } },
      [{ variableName: "missing", fromPath: "json.name" }],
    );
    expect(result.failures[0]).toMatch(/Unable to extract/);
  });
});
