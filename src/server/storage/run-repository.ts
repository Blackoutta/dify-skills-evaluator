import fs from "node:fs";
import path from "node:path";

import type { EvaluationRunResult, ScoreResult, TraceEvent } from "@/src/server/types/contracts";

const DEFAULT_ROOT = path.resolve(process.cwd(), "runs");

export interface RunRepository {
  ensureRunDir(runId: string): string;
  appendProgressLog(runId: string, line: string): string;
  readProgressLog(runId: string): string;
  readProgressLogLines(runId: string): string[];
  appendTraceEvent(runId: string, event: TraceEvent): string;
  readTrace(runId: string): TraceEvent[];
  writeTrace(runId: string, trace: TraceEvent[]): string;
  writeScore(runId: string, score: ScoreResult): string;
  writeVariables(runId: string, variables: Record<string, string>): string;
  writeRunResult(runId: string, result: EvaluationRunResult): string;
  appendRunnerLog(runId: string, fileName: "runner-output.log" | "runner-error.log", content: string): string;
  listRuns(): EvaluationRunResult[];
  readRunResult(runId: string): EvaluationRunResult | null;
}

export function createRunRepository(rootDir: string = DEFAULT_ROOT): RunRepository {
  function ensureRoot() {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  function writeJson(filePath: string, value: unknown): string {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return filePath;
  }

  return {
    ensureRunDir(runId) {
      ensureRoot();
      const runDir = path.join(rootDir, runId);
      fs.mkdirSync(runDir, { recursive: true });
      return runDir;
    },
    appendProgressLog(runId, line) {
      const filePath = path.join(this.ensureRunDir(runId), "progress.log");
      fs.appendFileSync(filePath, `${line}\n`, "utf8");
      return filePath;
    },
    readProgressLog(runId) {
      const filePath = path.join(this.ensureRunDir(runId), "progress.log");
      if (!fs.existsSync(filePath)) {
        return "";
      }
      return fs.readFileSync(filePath, "utf8");
    },
    readProgressLogLines(runId) {
      return this.readProgressLog(runId)
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
    },
    appendTraceEvent(runId, event) {
      const trace = this.readTrace(runId);
      trace.push(event);
      return this.writeTrace(runId, trace);
    },
    readTrace(runId) {
      const filePath = path.join(this.ensureRunDir(runId), "trace.json");
      if (!fs.existsSync(filePath)) {
        return [];
      }
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as TraceEvent[];
    },
    writeTrace(runId, trace) {
      return writeJson(path.join(this.ensureRunDir(runId), "trace.json"), trace);
    },
    writeScore(runId, score) {
      return writeJson(path.join(this.ensureRunDir(runId), "score.json"), score);
    },
    writeVariables(runId, variables) {
      return writeJson(path.join(this.ensureRunDir(runId), "variables.json"), variables);
    },
    writeRunResult(runId, result) {
      return writeJson(path.join(this.ensureRunDir(runId), "run.json"), result);
    },
    appendRunnerLog(runId, fileName, content) {
      const filePath = path.join(this.ensureRunDir(runId), fileName);
      fs.appendFileSync(filePath, content, "utf8");
      return filePath;
    },
    listRuns() {
      ensureRoot();
      return fs
        .readdirSync(rootDir)
        .map((entry) => this.readRunResult(entry))
        .filter((value): value is EvaluationRunResult => value !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    readRunResult(runId) {
      const filePath = path.join(rootDir, runId, "run.json");
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as EvaluationRunResult;
    },
  };
}
