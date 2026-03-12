import type { NormalizedBody, ResponseExtractor } from "@/src/server/types/contracts";
import { getValueAtPath } from "@/src/server/scoring/apply-field-rules";

export interface ExtractVariablesResult {
  variables: Record<string, string>;
  failures: string[];
}

export function extractVariables(
  body: NormalizedBody | undefined,
  extractors: ResponseExtractor[] | undefined,
): ExtractVariablesResult {
  const variables: Record<string, string> = {};
  const failures: string[] = [];

  for (const extractor of extractors ?? []) {
    const value = getValueAtPath(body, extractor.fromPath);
    if (value === undefined || value === null || value === "") {
      failures.push(`Unable to extract ${extractor.variableName} from ${extractor.fromPath}`);
      continue;
    }
    variables[extractor.variableName] = String(value);
  }

  return { variables, failures };
}
