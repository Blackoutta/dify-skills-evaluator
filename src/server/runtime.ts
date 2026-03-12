import path from "node:path";

import { getCaseRepository } from "@/src/server/cases/case-repository";
import { EvaluatorOrchestrator } from "@/src/server/orchestrator/evaluator-orchestrator";
import { TraceProxyService } from "@/src/server/proxy/trace-proxy-service";
import { CodexRunner } from "@/src/server/runners/codex-runner";
import { RunManager } from "@/src/server/run-manager";
import { createRunRepository } from "@/src/server/storage/run-repository";
import { getRunSecretStore } from "@/src/server/storage/run-secret-store";
import { getRunVariableStore } from "@/src/server/storage/run-variable-store";
import type { EvaluationRuntimeConfig } from "@/src/server/types/contracts";

const config: EvaluationRuntimeConfig = {
  proxyPort: Number(process.env.PORT ?? 3000),
  runnerTimeoutMs: 300_000,
  artifactRoot: process.cwd(),
  runsRoot: path.resolve(process.cwd(), "runs"),
};

const repository = createRunRepository(config.runsRoot);
const secretStore = getRunSecretStore();
const variableStore = getRunVariableStore();
const caseRepository = getCaseRepository();
const runner = new CodexRunner();
const orchestrator = new EvaluatorOrchestrator({
  caseRepository,
  runner,
  repository,
  secretStore,
  variableStore,
  config,
});
const runManager = new RunManager(orchestrator, repository);

export function getRuntimeConfig(): EvaluationRuntimeConfig {
  return config;
}

export function getOrchestrator(): EvaluatorOrchestrator {
  return orchestrator;
}

export function getTraceProxyService(): TraceProxyService {
  return new TraceProxyService({
    secretStore,
    repository,
  });
}

export function getRunRepository() {
  return repository;
}

export function getRunManager() {
  return runManager;
}
