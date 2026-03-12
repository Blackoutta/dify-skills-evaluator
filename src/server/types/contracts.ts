import path from "node:path";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type AppType = "chatflow" | "workflow" | "knowledge";
export type ArtifactKind = "file";

export interface RequiredAppSpec {
  appAlias: string;
  appType: AppType;
  purpose: string;
}

export interface TestArtifact {
  artifactId: string;
  kind: ArtifactKind;
  path: string;
  mimeType?: string;
  displayName?: string;
  description?: string;
}

export interface FieldRule {
  path: string;
  rule:
    | "equals"
    | "non_empty"
    | "empty"
    | "equals_variable"
    | "contains"
    | "contains_variable"
    | "matches_regex";
  value?: string | number | boolean;
  variableName?: string;
  pattern?: string;
}

export interface ResponseExtractor {
  variableName: string;
  fromPath: string;
}

export interface ExpectedTraceStep {
  stepId: string;
  order: number;
  appAlias: string;
  method: HttpMethod;
  path: string;
  requestRules?: FieldRule[];
  responseRules?: FieldRule[];
  responseExtractors?: ResponseExtractor[];
}

export interface ExpectedTraceSpec {
  steps: ExpectedTraceStep[];
}

export interface EvaluationAssertion {
  id: string;
  description: string;
  type:
    | "http_status_2xx"
    | "response_has_field"
    | "conversation_reused"
    | "minimum_trace_steps"
    | "app_alias_used"
    | "field_rules_pass"
    | "response_content_check";
}

export interface EvaluationTestCase {
  id: string;
  title: string;
  appType: AppType;
  requiredApps: RequiredAppSpec[];
  objective: string;
  promptForAgent: string;
  maxTurns: number;
  tokenBudget?: TokenBudget;
  artifacts?: TestArtifact[];
  expectedTrace: ExpectedTraceSpec;
  assertions: EvaluationAssertion[];
  notes?: Record<string, unknown>;
}

export interface TokenBudget {
  targetTotalTokens: number;
  maxTotalTokens?: number;
}

export interface TargetAppBinding {
  appAlias: string;
  appType: AppType;
  realDifyBaseUrl: string;
  apiKey: string;
  user?: string;
}

export interface StartEvaluationInput {
  runnerKind: "codex";
  skillPath: string;
  testCaseId: string;
  appBindings: TargetAppBinding[];
  defaultUser?: string;
}

export interface RunnerExecutionInput {
  skillPath: string;
  workspaceRoot: string;
  testCase: EvaluationTestCase;
  env: Record<string, string>;
  artifactBindings: ResolvedArtifactBinding[];
  workingDirectory: string;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface RunnerExecutionResult {
  runnerKind: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number | null;
  status: "completed" | "failed" | "timed_out";
  stdoutPath: string;
  stderrPath: string;
  usage?: RunnerUsage;
}

export interface RunnerUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface JsonBody {
  kind: "json";
  value: unknown;
}

export interface MultipartFilePart {
  fieldName: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface MultipartBody {
  kind: "multipart";
  fields: Record<string, string>;
  files: MultipartFilePart[];
}

export interface TextBody {
  kind: "text";
  value: string;
}

export type NormalizedBody = JsonBody | MultipartBody | TextBody;

export interface TraceRequest {
  method: HttpMethod;
  url: string;
  path: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  body?: NormalizedBody;
  rawBody?: string;
}

export interface TraceResponse {
  status: number;
  headers: Record<string, string>;
  body?: NormalizedBody;
  rawBody?: string;
}

export interface TraceEvent {
  id: string;
  runId: string;
  stepIndex: number;
  appAlias: string;
  timestampStart: string;
  timestampEnd: string;
  durationMs: number;
  request: TraceRequest;
  response: TraceResponse;
}

export interface ScoreFinding {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  pointsDelta: number;
}

export interface ScoreResult {
  totalScore: number;
  breakdown: {
    sequenceScore: number;
    resultScore: number;
    conversationStateScore: number;
    contentScore?: number;
    tokenEfficiencyScore?: number;
  };
  weights: {
    sequenceScore: number;
    resultScore: number;
    conversationStateScore: number;
    contentScore?: number;
    tokenEfficiencyScore?: number;
  };
  findings: ScoreFinding[];
}

export interface EvaluationRunResult {
  runId: string;
  status: "completed" | "failed" | "timed_out";
  testCaseId: string;
  requiredApps: RequiredAppSpec[];
  artifacts?: TestArtifact[];
  runner: RunnerExecutionResult;
  trace: TraceEvent[];
  score: ScoreResult;
  variables: Record<string, string>;
  createdAt: string;
}

export interface EvaluationRuntimeConfig {
  proxyPort: number;
  runnerTimeoutMs: number;
  artifactRoot: string;
  runsRoot: string;
}

export interface ResolvedArtifactBinding {
  artifactId: string;
  absolutePath: string;
  mimeType?: string;
  displayName?: string;
}

const FIELD_RULES = new Set<FieldRule["rule"]>([
  "equals",
  "non_empty",
  "empty",
  "equals_variable",
  "contains",
  "contains_variable",
  "matches_regex",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEvaluationTestCase(value: unknown): EvaluationTestCase {
  assert(isRecord(value), "Test case must be an object");
  assert(typeof value.id === "string" && value.id.length > 0, "id is required");
  assert(typeof value.title === "string" && value.title.length > 0, "title is required");
  assert(
    value.appType === "chatflow" || value.appType === "workflow" || value.appType === "knowledge",
    "appType is invalid",
  );
  assert(Array.isArray(value.requiredApps) && value.requiredApps.length > 0, "requiredApps is required");
  assert(typeof value.objective === "string", "objective is required");
  assert(typeof value.promptForAgent === "string", "promptForAgent is required");
  assert(typeof value.maxTurns === "number" && value.maxTurns > 0, "maxTurns must be > 0");
  assert(isRecord(value.expectedTrace), "expectedTrace is required");
  assert(Array.isArray(value.expectedTrace.steps), "expectedTrace.steps is required");
  assert(Array.isArray(value.assertions), "assertions is required");

  const stepIds = new Set<string>();
  const orders = new Set<number>();

  for (const app of value.requiredApps) {
    assert(isRecord(app), "requiredApps entries must be objects");
    assert(typeof app.appAlias === "string" && app.appAlias.length > 0, "requiredApps.appAlias is required");
  }

  for (const step of value.expectedTrace.steps) {
    assert(isRecord(step), "step must be an object");
    assert(typeof step.stepId === "string" && step.stepId.length > 0, "stepId is required");
    assert(!stepIds.has(step.stepId), `Duplicate stepId: ${step.stepId}`);
    stepIds.add(step.stepId);
    assert(typeof step.order === "number" && step.order > 0, "step.order must be > 0");
    assert(!orders.has(step.order), `Duplicate order: ${step.order}`);
    orders.add(step.order);
    assert(typeof step.appAlias === "string" && step.appAlias.length > 0, "step.appAlias is required");
    assert(typeof step.method === "string", "step.method is required");
    assert(typeof step.path === "string" && step.path.startsWith("/"), "step.path must start with /");

    for (const ruleGroup of [step.requestRules, step.responseRules]) {
      if (!ruleGroup) continue;
      assert(Array.isArray(ruleGroup), "rule group must be an array");
      for (const rule of ruleGroup) {
        assert(isRecord(rule), "field rule must be an object");
        assert(typeof rule.path === "string" && rule.path.length > 0, "field rule path is required");
        assert(typeof rule.rule === "string" && FIELD_RULES.has(rule.rule as FieldRule["rule"]), "field rule is invalid");
      }
    }
  }

  if (value.artifacts !== undefined) {
    assert(Array.isArray(value.artifacts), "artifacts must be an array");
    for (const artifact of value.artifacts) {
      assert(isRecord(artifact), "artifact must be an object");
      assert(typeof artifact.artifactId === "string" && artifact.artifactId.length > 0, "artifactId is required");
      assert(artifact.kind === "file", "artifact kind is invalid");
      assert(typeof artifact.path === "string" && artifact.path.length > 0, "artifact path is required");
      assert(!path.isAbsolute(artifact.path), "artifact path must be relative");
    }
  }

  if (value.tokenBudget !== undefined) {
    assert(isRecord(value.tokenBudget), "tokenBudget must be an object");
    assert(
      typeof value.tokenBudget.targetTotalTokens === "number" && value.tokenBudget.targetTotalTokens > 0,
      "tokenBudget.targetTotalTokens must be > 0",
    );
    if (value.tokenBudget.maxTotalTokens !== undefined) {
      assert(
        typeof value.tokenBudget.maxTotalTokens === "number" &&
          value.tokenBudget.maxTotalTokens >= value.tokenBudget.targetTotalTokens,
        "tokenBudget.maxTotalTokens must be >= tokenBudget.targetTotalTokens",
      );
    }
  }

  return value as unknown as EvaluationTestCase;
}

export function validateStartEvaluationInput(value: unknown): StartEvaluationInput {
  assert(isRecord(value), "StartEvaluationInput must be an object");
  assert(value.runnerKind === "codex", "runnerKind must be codex");
  assert(typeof value.skillPath === "string" && value.skillPath.length > 0, "skillPath is required");
  assert(typeof value.testCaseId === "string" && value.testCaseId.length > 0, "testCaseId is required");
  assert(Array.isArray(value.appBindings) && value.appBindings.length > 0, "appBindings is required");

  const aliases = new Set<string>();
  for (const binding of value.appBindings) {
    assert(isRecord(binding), "binding must be an object");
    assert(typeof binding.appAlias === "string" && binding.appAlias.length > 0, "binding.appAlias is required");
    assert(!aliases.has(binding.appAlias), `Duplicate appAlias: ${binding.appAlias}`);
    aliases.add(binding.appAlias);
    assert(typeof binding.realDifyBaseUrl === "string" && binding.realDifyBaseUrl.length > 0, "realDifyBaseUrl is required");
    assert(typeof binding.apiKey === "string" && binding.apiKey.length > 0, "apiKey is required");
  }

  return value as unknown as StartEvaluationInput;
}
