import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveArtifacts } from "@/src/server/artifacts/artifact-resolver";

describe("artifact-resolver", () => {
  it("resolves relative artifacts into absolute paths", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-root-"));
    fs.mkdirSync(path.join(root, "fixtures"), { recursive: true });
    fs.writeFileSync(path.join(root, "fixtures", "a.txt"), "hello");

    const result = resolveArtifacts(
      [{ artifactId: "a", kind: "file", path: "fixtures/a.txt", displayName: "a.txt" }],
      { artifactRoot: root },
    );

    expect(result[0].absolutePath).toBe(path.join(root, "fixtures", "a.txt"));
  });

  it("rejects missing files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-root-"));

    expect(() =>
      resolveArtifacts([{ artifactId: "a", kind: "file", path: "fixtures/a.txt" }], { artifactRoot: root }),
    ).toThrow(/does not exist/);
  });

  it("rejects escaped paths", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-root-"));
    expect(() =>
      resolveArtifacts([{ artifactId: "a", kind: "file", path: "../secret.txt" }], { artifactRoot: root }),
    ).toThrow(/escapes artifact root/);
  });
});
