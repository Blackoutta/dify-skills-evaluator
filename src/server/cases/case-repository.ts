import fs from "node:fs";
import path from "node:path";

import {
  type EvaluationTestCase,
  validateEvaluationTestCase,
} from "@/src/server/types/contracts";

const CASES_ROOT = path.resolve(process.cwd(), "src/server/cases");

export interface CaseRepository {
  listCases(): EvaluationTestCase[];
  getCaseById(caseId: string): EvaluationTestCase;
}

export function createCaseRepository(rootDir: string = CASES_ROOT): CaseRepository {
  function readJsonFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const nextPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return readJsonFiles(nextPath);
      }
      return entry.name.endsWith(".json") ? [nextPath] : [];
    });
  }

  function loadCases(): EvaluationTestCase[] {
    if (!fs.existsSync(rootDir)) {
      return [];
    }
    return readJsonFiles(rootDir).map((filePath) => {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      return validateEvaluationTestCase(parsed);
    });
  }

  return {
    listCases() {
      return loadCases();
    },
    getCaseById(caseId) {
      const testCase = loadCases().find((item) => item.id === caseId);
      if (!testCase) {
        throw new Error(`Unknown test case: ${caseId}`);
      }
      return testCase;
    },
  };
}

let singleton: CaseRepository | undefined;

export function getCaseRepository(): CaseRepository {
  singleton ??= createCaseRepository();
  return singleton;
}
