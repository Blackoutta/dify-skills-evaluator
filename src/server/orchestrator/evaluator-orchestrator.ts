import path from "node:path";

import { resolveArtifacts } from "@/src/server/artifacts/artifact-resolver";
import type { CaseRepository } from "@/src/server/cases/case-repository";
import { scoreRun } from "@/src/server/scoring/score-run";
import type { AgentRunner } from "@/src/server/runners/agent-runner";
import type { RunRepository } from "@/src/server/storage/run-repository";
import type { RunSecretStore } from "@/src/server/storage/run-secret-store";
import type { RunVariableStore } from "@/src/server/storage/run-variable-store";
import {
  type EvaluationRunResult,
  type EvaluationRuntimeConfig,
  type StartEvaluationInput,
  validateStartEvaluationInput,
} from "@/src/server/types/contracts";

export interface EvaluatorOrchestratorDeps {
  caseRepository: CaseRepository;
  runner: AgentRunner;
  repository: RunRepository;
  secretStore: RunSecretStore;
  variableStore: RunVariableStore;
  config: EvaluationRuntimeConfig;
  now?: () => Date;
  idFactory?: () => string;
}

const EVALUATOR_PROXY_API_KEY = "evaluator-proxy-token";

export class EvaluatorOrchestrator {
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly deps: EvaluatorOrchestratorDeps) {
    this.now = deps.now ?? (() => new Date());
    this.idFactory = deps.idFactory ?? (() => crypto.randomUUID());
  }

  async run(input: StartEvaluationInput): Promise<EvaluationRunResult> {
    return this.runWithId(this.idFactory(), input);
  }

  async runWithId(
    runId: string,
    input: StartEvaluationInput,
    log: (message: string) => void = () => {},
  ): Promise<EvaluationRunResult> {
    const parsed = validateStartEvaluationInput(input);
    log(`Validated start input for case ${parsed.testCaseId}`);
    const testCase = this.deps.caseRepository.getCaseById(parsed.testCaseId);
    log(`Loaded test case ${testCase.id}`);

    const missingAliases = testCase.requiredApps
      .map((app) => app.appAlias)
      .filter((alias) => !parsed.appBindings.some((binding) => binding.appAlias === alias));
    if (missingAliases.length > 0) {
      throw new Error(`Missing app bindings for: ${missingAliases.join(", ")}`);
    }

    const createdAt = this.now().toISOString();
    const artifactBindings = resolveArtifacts(testCase.artifacts, {
      artifactRoot: this.deps.config.artifactRoot,
    });
    log(`Resolved ${artifactBindings.length} artifacts`);

    this.deps.repository.ensureRunDir(runId);
    this.deps.secretStore.setRunBindings(runId, parsed.appBindings);
    log(`Stored ${parsed.appBindings.length} app bindings`);

    const env = this.buildRunnerEnv(runId, parsed);
    log(`Prepared runner environment for ${Object.keys(env).length} variables`);
    const runner = await this.deps.runner.run({
      skillPath: parsed.skillPath,
      workspaceRoot: this.deps.config.artifactRoot,
      testCase,
      env,
      artifactBindings,
      workingDirectory: path.join(this.deps.config.runsRoot, runId),
      timeoutMs: this.deps.config.runnerTimeoutMs,
      onStdout: (chunk) => {
        const trimmed = chunk.trim();
        if (trimmed) {
          log(`[stdout] ${trimmed}`);
        }
        this.deps.repository.appendRunnerLog(runId, "runner-output.log", chunk);
      },
      onStderr: (chunk) => {
        const trimmed = chunk.trim();
        if (trimmed) {
          log(`[stderr] ${trimmed}`);
        }
        this.deps.repository.appendRunnerLog(runId, "runner-error.log", chunk);
      },
    });
    log(`Runner finished with status ${runner.status}`);

    const trace = this.deps.repository.readTrace(runId);
    log(`Loaded ${trace.length} trace events`);
    const scored = scoreRun({ testCase, trace, runner });
    this.deps.variableStore.setVariables(runId, scored.variables);
    this.deps.repository.writeScore(runId, scored.score);
    this.deps.repository.writeVariables(runId, scored.variables);
    log(`Computed score ${scored.score.totalScore}`);

    const result: EvaluationRunResult = {
      runId,
      status: runner.status,
      skillPath: parsed.skillPath,
      testCaseId: testCase.id,
      requiredApps: testCase.requiredApps,
      artifacts: testCase.artifacts,
      runner,
      trace,
      score: scored.score,
      variables: scored.variables,
      createdAt,
    };

    this.deps.repository.writeRunResult(runId, result);
    log(`Persisted run result`);
    return result;
  }

  private buildRunnerEnv(runId: string, input: StartEvaluationInput): Record<string, string> {
    const noProxyHosts = mergeNoProxyHosts(process.env.NO_PROXY, process.env.no_proxy);
    const defaultUser = input.defaultUser ?? "eval-user";
    const env: Record<string, string> = {
      EVAL_RUN_ID: runId,
      DIFY_USER: defaultUser,
      DIFY_API_KEY: EVALUATOR_PROXY_API_KEY,
      DIFY_APP_USER: defaultUser,
      NO_PROXY: noProxyHosts,
      no_proxy: noProxyHosts,
    };

    for (const binding of input.appBindings) {
      const proxyBaseUrl = `http://127.0.0.1:${this.deps.config.proxyPort}/api/runs/${runId}/apps/${binding.appAlias}/proxy`;
      env[`DIFY_APP_BASE_URL_${binding.appAlias.toUpperCase()}`] = proxyBaseUrl;

      if (input.appBindings.length === 1) {
        env.DIFY_BASE_URL = proxyBaseUrl;
      }
    }

    return env;
  }
}

function mergeNoProxyHosts(...values: Array<string | undefined>): string {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);

  for (const value of values) {
    if (!value) {
      continue;
    }

    for (const part of value.split(",")) {
      const host = part.trim();
      if (host) {
        hosts.add(host);
      }
    }
  }

  return Array.from(hosts).join(",");
}
