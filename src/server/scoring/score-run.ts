import { applyFieldRules } from "@/src/server/scoring/apply-field-rules";
import { extractVariables } from "@/src/server/scoring/extract-variables";
import type {
  EvaluationTestCase,
  RunnerExecutionResult,
  ScoreFinding,
  ScoreResult,
  TraceEvent,
} from "@/src/server/types/contracts";

export interface ScoreRunOutput {
  score: ScoreResult;
  variables: Record<string, string>;
}

const BASE_WEIGHTS = {
  sequenceScore: 0.35,
  resultScore: 0.25,
  conversationStateScore: 0.15,
  contentScore: 0.1,
  tokenEfficiencyScore: 0.15,
} as const;

export interface ScoreRunInput {
  testCase: EvaluationTestCase;
  trace: TraceEvent[];
  runner?: RunnerExecutionResult;
}

function pct(value: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((value / total) * 10000) / 100;
}

function roundWeight(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function getTokenEfficiencyScore(
  testCase: EvaluationTestCase,
  runner: RunnerExecutionResult | undefined,
): number | undefined {
  const totalTokens = runner?.usage?.totalTokens;
  const budget = testCase.tokenBudget;

  if (totalTokens === undefined || budget === undefined) {
    return undefined;
  }

  const target = budget.targetTotalTokens;
  const max = budget.maxTotalTokens ?? target * 2;

  if (totalTokens <= target) {
    return 100;
  }

  if (totalTokens >= max) {
    return 0;
  }

  const progress = (totalTokens - target) / (max - target);
  return roundScore((1 - progress ** 2) * 100);
}

function findMatchingTraceIndex(
  trace: TraceEvent[],
  expected: EvaluationTestCase["expectedTrace"]["steps"][number],
  startIndex: number,
): number {
  for (let index = startIndex; index < trace.length; index += 1) {
    const candidate = trace[index];
    if (
      candidate.appAlias === expected.appAlias &&
      candidate.request.method === expected.method &&
      candidate.request.path === expected.path
    ) {
      return index;
    }
  }

  return -1;
}

export function scoreRun({ testCase, trace, runner }: ScoreRunInput): ScoreRunOutput {
  const findings: ScoreFinding[] = [];
  const variables: Record<string, string> = {};
  const steps = testCase.expectedTrace.steps.slice().sort((a, b) => a.order - b.order);
  let matchedSequence = 0;
  let passedResult = 0;
  let contentChecks = 0;
  let passedContentChecks = 0;
  let conversationRelevant = false;
  let conversationPassed = true;
  let traceCursor = 0;

  for (let index = 0; index < steps.length; index += 1) {
    const expected = steps[index];
    const actualIndex = findMatchingTraceIndex(trace, expected, traceCursor);
    const actual = actualIndex >= 0 ? trace[actualIndex] : undefined;

    if (!actual) {
      findings.push({
        code: "missing_trace_step",
        severity: "error",
        message: `Missing trace for step ${expected.stepId}`,
        pointsDelta: -25,
      });
      conversationPassed = false;
      continue;
    }

    traceCursor = actualIndex + 1;

    const basicMatch =
      actual.appAlias === expected.appAlias &&
      actual.request.method === expected.method &&
      actual.request.path === expected.path;

    if (basicMatch) {
      matchedSequence += 1;
    } else {
      findings.push({
        code: "sequence_mismatch",
        severity: "error",
        message: `Step ${expected.stepId} did not match appAlias/method/path`,
        pointsDelta: -20,
      });
    }

    const requestRuleResult = applyFieldRules(actual.request.body, expected.requestRules, variables);
    const responseRuleResult = applyFieldRules(actual.response.body, expected.responseRules, variables);
    const allRulesPassed = requestRuleResult.passed && responseRuleResult.passed;

    if (!requestRuleResult.passed) {
      findings.push({
        code: "request_rule_failed",
        severity: "warn",
        message: `${expected.stepId} request rules failed: ${requestRuleResult.failures.join(", ")}`,
        pointsDelta: -10,
      });
    }

    if (!responseRuleResult.passed) {
      findings.push({
        code: "response_rule_failed",
        severity: "warn",
        message: `${expected.stepId} response rules failed: ${responseRuleResult.failures.join(", ")}`,
        pointsDelta: -10,
      });
    }

    const isSuccessStatus = actual.response.status >= 200 && actual.response.status < 300;
    if (basicMatch && isSuccessStatus && allRulesPassed) {
      passedResult += 1;
    }

    const extracted = extractVariables(actual.response.body, expected.responseExtractors);
    Object.assign(variables, extracted.variables);
    for (const failure of extracted.failures) {
      findings.push({
        code: "variable_extraction_failed",
        severity: "warn",
        message: failure,
        pointsDelta: -5,
      });
    }

    const conversationRule = expected.requestRules?.find(
      (rule) => rule.path === "json.conversation_id" && rule.rule === "equals_variable",
    );
    if (conversationRule?.variableName === "conversation_id") {
      conversationRelevant = true;
      if (!requestRuleResult.passed) {
        conversationPassed = false;
      }
    }

    const contentRules = (expected.responseRules ?? []).filter((rule) =>
      ["contains", "contains_variable", "matches_regex"].includes(rule.rule),
    );
    if (contentRules.length > 0) {
      contentChecks += contentRules.length;
      passedContentChecks += contentRules.length - responseRuleResult.failures.length;
    }
  }

  const sequenceScore = pct(matchedSequence, steps.length);
  const resultScore = pct(passedResult, steps.length);
  const conversationStateScore = conversationRelevant ? (conversationPassed ? 100 : 0) : 100;
  const contentScore = contentChecks > 0 ? pct(passedContentChecks, contentChecks) : undefined;
  const tokenEfficiencyScore = getTokenEfficiencyScore(testCase, runner);

  if (runner?.usage?.totalTokens !== undefined && testCase.tokenBudget !== undefined) {
    const target = testCase.tokenBudget.targetTotalTokens;
    const totalTokens = runner.usage.totalTokens;
    const max = testCase.tokenBudget.maxTotalTokens ?? target * 2;
    if (totalTokens > target) {
      const exceededMax = totalTokens >= max;
      findings.push({
        code: "token_budget_exceeded",
        severity: exceededMax ? "warn" : "info",
        message: exceededMax
          ? `Token usage ${totalTokens} exceeded max budget ${max} (target ${target})`
          : `Token usage ${totalTokens} exceeded target budget ${target}`,
        pointsDelta: -5,
      });
    }
  }

  const activeWeights = {
    sequenceScore: BASE_WEIGHTS.sequenceScore,
    resultScore: BASE_WEIGHTS.resultScore,
    conversationStateScore: BASE_WEIGHTS.conversationStateScore,
    contentScore: contentScore === undefined ? undefined : BASE_WEIGHTS.contentScore,
    tokenEfficiencyScore: tokenEfficiencyScore === undefined ? undefined : BASE_WEIGHTS.tokenEfficiencyScore,
  };
  const activeWeightTotal = Object.values(activeWeights).reduce(
    (sum, weight) => sum + (weight ?? 0),
    0,
  );
  const normalizedWeightValues = {
    sequenceScore: (activeWeights.sequenceScore / activeWeightTotal) * 100,
    resultScore: (activeWeights.resultScore / activeWeightTotal) * 100,
    conversationStateScore: (activeWeights.conversationStateScore / activeWeightTotal) * 100,
    contentScore:
      activeWeights.contentScore === undefined
        ? undefined
        : (activeWeights.contentScore / activeWeightTotal) * 100,
    tokenEfficiencyScore:
      activeWeights.tokenEfficiencyScore === undefined
        ? undefined
        : (activeWeights.tokenEfficiencyScore / activeWeightTotal) * 100,
  };
  const normalizedWeights = {
    sequenceScore: roundWeight(normalizedWeightValues.sequenceScore),
    resultScore: roundWeight(normalizedWeightValues.resultScore),
    conversationStateScore: roundWeight(normalizedWeightValues.conversationStateScore),
    contentScore:
      normalizedWeightValues.contentScore === undefined
        ? undefined
        : roundWeight(normalizedWeightValues.contentScore),
    tokenEfficiencyScore:
      normalizedWeightValues.tokenEfficiencyScore === undefined
        ? undefined
        : roundWeight(normalizedWeightValues.tokenEfficiencyScore),
  };
  const weightedTotal =
    normalizedWeightValues.sequenceScore * sequenceScore +
    normalizedWeightValues.resultScore * resultScore +
    normalizedWeightValues.conversationStateScore * conversationStateScore +
    (normalizedWeightValues.contentScore === undefined || contentScore === undefined
      ? 0
      : normalizedWeightValues.contentScore * contentScore) +
    (normalizedWeightValues.tokenEfficiencyScore === undefined || tokenEfficiencyScore === undefined
      ? 0
      : normalizedWeightValues.tokenEfficiencyScore * tokenEfficiencyScore);
  const totalScore = Math.round((weightedTotal / 100) * 100) / 100;

  return {
    variables,
    score: {
      totalScore,
      breakdown: {
        sequenceScore,
        resultScore,
        conversationStateScore,
        contentScore,
        tokenEfficiencyScore,
      },
      weights: normalizedWeights,
      findings,
    },
  };
}
