import type { EvaluatorOrchestrator } from "@/src/server/orchestrator/evaluator-orchestrator";
import type { RunRepository } from "@/src/server/storage/run-repository";
import type { EvaluationRunResult, StartEvaluationInput } from "@/src/server/types/contracts";

export type RunSessionStatus = "queued" | "running" | "completed" | "failed" | "timed_out";

export interface RunSession {
  runId: string;
  testCaseId: string;
  status: RunSessionStatus;
  createdAt: string;
  updatedAt: string;
  logs: string[];
  error?: string;
  result?: EvaluationRunResult;
}

export interface ActiveRunSessionSummary {
  runId: string;
  testCaseId: string;
  status: Extract<RunSessionStatus, "queued" | "running">;
  createdAt: string;
  updatedAt: string;
}

export class RunManager {
  private readonly sessions = new Map<string, RunSession>();

  constructor(
    private readonly orchestrator: EvaluatorOrchestrator,
    private readonly repository: RunRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => crypto.randomUUID(),
  ) {}

  start(input: StartEvaluationInput): RunSession {
    const runId = this.idFactory();
    const createdAt = this.now().toISOString();
    const session: RunSession = {
      runId,
      testCaseId: input.testCaseId,
      status: "queued",
      createdAt,
      updatedAt: createdAt,
      logs: [],
    };
    this.sessions.set(runId, session);
    this.appendLog(runId, "Run queued");

    void this.execute(runId, input);
    return this.get(runId)!;
  }

  get(runId: string): RunSession | undefined {
    const session = this.sessions.get(runId);
    if (!session) return undefined;
    return {
      ...session,
      logs: [...session.logs],
    };
  }

  listActiveSessions(): ActiveRunSessionSummary[] {
    return [...this.sessions.values()]
      .filter(
        (session): session is RunSession & { status: "queued" | "running" } =>
          session.status === "queued" || session.status === "running",
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((session) => ({
        runId: session.runId,
        testCaseId: session.testCaseId,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }));
  }

  private appendLog(runId: string, message: string) {
    const session = this.sessions.get(runId);
    if (!session) return;
    const line = `[${this.now().toISOString()}] ${message}`;
    session.logs.push(line);
    session.updatedAt = this.now().toISOString();
    this.repository.appendProgressLog(runId, line);
  }

  private async execute(runId: string, input: StartEvaluationInput) {
    const session = this.sessions.get(runId);
    if (!session) return;
    session.status = "running";
    this.appendLog(runId, "Run started");

    try {
      const result = await this.orchestrator.runWithId(runId, input, (message) => {
        this.appendLog(runId, message);
      });
      session.result = result;
      session.status = result.status;
      this.appendLog(runId, `Run finished with status ${result.status}`);
    } catch (error) {
      session.status = "failed";
      session.error = error instanceof Error ? error.message : "unknown_error";
      this.appendLog(runId, `Run failed: ${session.error}`);
    }
  }
}
