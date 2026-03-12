import fs from "node:fs";
import path from "node:path";

import type { EvaluationRuntimeConfig, ResolvedArtifactBinding, TestArtifact } from "@/src/server/types/contracts";

export function resolveArtifacts(
  artifacts: TestArtifact[] | undefined,
  config: Pick<EvaluationRuntimeConfig, "artifactRoot">,
): ResolvedArtifactBinding[] {
  if (!artifacts?.length) {
    return [];
  }

  return artifacts.map((artifact) => {
    const absolutePath = path.resolve(config.artifactRoot, artifact.path);
    const relative = path.relative(config.artifactRoot, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Artifact path escapes artifact root: ${artifact.path}`);
    }
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Artifact file does not exist: ${artifact.path}`);
    }

    return {
      artifactId: artifact.artifactId,
      absolutePath,
      mimeType: artifact.mimeType,
      displayName: artifact.displayName,
    };
  });
}
