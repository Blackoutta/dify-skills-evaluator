import type { FieldRule, NormalizedBody } from "@/src/server/types/contracts";

export interface FieldRuleResult {
  passed: boolean;
  failures: string[];
}

function splitPath(path: string): string[] {
  return path.split(".").flatMap((segment) => {
    const matches = segment.match(/[^\[\]]+/g);
    return matches ?? [];
  });
}

export function getValueAtPath(body: NormalizedBody | undefined, targetPath: string): unknown {
  if (!body) {
    return undefined;
  }
  const segments = splitPath(targetPath);
  if (!segments.length) {
    return undefined;
  }

  let current: unknown;
  if (segments[0] === "json" && body.kind === "json") {
    current = body.value;
    segments.shift();
  } else if (segments[0] === "multipart" && body.kind === "multipart") {
    current = body;
    segments.shift();
  } else if (segments[0] === "text" && body.kind === "text") {
    current = { value: body.value };
    segments.shift();
  } else {
    return undefined;
  }

  for (const segment of segments) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
      continue;
    }
    if (typeof current === "object" && current !== null) {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function applyFieldRules(
  body: NormalizedBody | undefined,
  rules: FieldRule[] | undefined,
  variables: Record<string, string>,
): FieldRuleResult {
  const failures: string[] = [];

  for (const rule of rules ?? []) {
    const actual = getValueAtPath(body, rule.path);
    switch (rule.rule) {
      case "equals":
        if (actual !== rule.value) failures.push(`${rule.path} expected ${String(rule.value)}`);
        break;
      case "non_empty":
        if (!isNonEmpty(actual)) failures.push(`${rule.path} expected non-empty`);
        break;
      case "empty":
        if (actual !== "" && actual !== undefined && actual !== null) failures.push(`${rule.path} expected empty`);
        break;
      case "equals_variable": {
        const variable = rule.variableName ? variables[rule.variableName] : undefined;
        if (variable === undefined) {
          failures.push(`missing variable ${rule.variableName ?? ""}`.trim());
        } else if (String(actual) !== variable) {
          failures.push(`${rule.path} expected variable ${rule.variableName}`);
        }
        break;
      }
      case "contains":
        if (!String(actual ?? "").includes(String(rule.value ?? ""))) {
          failures.push(`${rule.path} expected to contain ${String(rule.value)}`);
        }
        break;
      case "contains_variable": {
        const variable = rule.variableName ? variables[rule.variableName] : undefined;
        if (variable === undefined) {
          failures.push(`missing variable ${rule.variableName ?? ""}`.trim());
        } else if (!String(actual ?? "").includes(variable)) {
          failures.push(`${rule.path} expected to contain variable ${rule.variableName}`);
        }
        break;
      }
      case "matches_regex":
        if (!rule.pattern || !(new RegExp(rule.pattern).test(String(actual ?? "")))) {
          failures.push(`${rule.path} failed regex ${rule.pattern ?? ""}`.trim());
        }
        break;
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
