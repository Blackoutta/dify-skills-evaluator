import type { RunnerExecutionInput, RunnerExecutionResult } from "@/src/server/types/contracts";

export interface AgentRunner {
  kind: string;
  run(input: RunnerExecutionInput): Promise<RunnerExecutionResult>;
}
