import { applyFieldRules, type FieldRuleResult } from "@/src/server/scoring/apply-field-rules";
import { extractVariables } from "@/src/server/scoring/extract-variables";
import type {
  EvaluationTestCase,
  RunnerExecutionResult,
  ScoreWeights,
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

function getScoreWeights(testCase: EvaluationTestCase): Required<ScoreWeights> {
  return {
    sequenceScore: testCase.scoreWeights?.sequenceScore ?? BASE_WEIGHTS.sequenceScore,
    resultScore: testCase.scoreWeights?.resultScore ?? BASE_WEIGHTS.resultScore,
    conversationStateScore:
      testCase.scoreWeights?.conversationStateScore ?? BASE_WEIGHTS.conversationStateScore,
    contentScore: testCase.scoreWeights?.contentScore ?? BASE_WEIGHTS.contentScore,
    tokenEfficiencyScore: testCase.scoreWeights?.tokenEfficiencyScore ?? BASE_WEIGHTS.tokenEfficiencyScore,
  };
}

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

  const remaining = (max - totalTokens) / (max - target);
  return roundScore(remaining ** 2 * 100);
}

interface TraceCandidateMatch {
  actual: TraceEvent;
  actualIndex: number;
  requestRuleResult: FieldRuleResult;
  responseRuleResult: FieldRuleResult;
  isSuccessStatus: boolean;
  allRulesPassed: boolean;
}

function isExpectedTraceMatch(
  trace: TraceEvent[],
  expected: EvaluationTestCase["expectedTrace"]["steps"][number],
  index: number,
): boolean {
  const candidate = trace[index];
  return (
    candidate.appAlias === expected.appAlias &&
    candidate.request.method === expected.method &&
    candidate.request.path === expected.path
  );
}

function compareCandidateQuality(a: TraceCandidateMatch, b: TraceCandidateMatch): number {
  if (a.isSuccessStatus !== b.isSuccessStatus) {
    return a.isSuccessStatus ? 1 : -1;
  }

  if (a.requestRuleResult.failures.length !== b.requestRuleResult.failures.length) {
    return b.requestRuleResult.failures.length - a.requestRuleResult.failures.length;
  }

  if (a.responseRuleResult.failures.length !== b.responseRuleResult.failures.length) {
    return b.responseRuleResult.failures.length - a.responseRuleResult.failures.length;
  }

  return b.actualIndex - a.actualIndex;
}

function findBestMatchingTrace(
  trace: TraceEvent[],
  expected: EvaluationTestCase["expectedTrace"]["steps"][number],
  startIndex: number,
  variables: Record<string, string>,
): TraceCandidateMatch | undefined {
  let bestCandidate: TraceCandidateMatch | undefined;

  for (let index = startIndex; index < trace.length; index += 1) {
    if (!isExpectedTraceMatch(trace, expected, index)) {
      continue;
    }

    const actual = trace[index];
    const requestRuleResult = applyFieldRules(actual.request.body, expected.requestRules, variables);
    const responseRuleResult = applyFieldRules(actual.response.body, expected.responseRules, variables);
    const isSuccessStatus = actual.response.status >= 200 && actual.response.status < 300;
    const allRulesPassed = requestRuleResult.passed && responseRuleResult.passed;
    const candidateMatch = {
      actual,
      actualIndex: index,
      requestRuleResult,
      responseRuleResult,
      isSuccessStatus,
      allRulesPassed,
    };

    if (isSuccessStatus && allRulesPassed) {
      return candidateMatch;
    }

    if (!bestCandidate || compareCandidateQuality(candidateMatch, bestCandidate) > 0) {
      bestCandidate = candidateMatch;
    }
  }

  return bestCandidate;
}

export function scoreRun({ testCase, trace, runner }: ScoreRunInput): ScoreRunOutput {
  const findings: ScoreFinding[] = [];
  const variables: Record<string, string> = {};
  const baseWeights = getScoreWeights(testCase);
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
    const matchedCandidate = findBestMatchingTrace(trace, expected, traceCursor, variables);
    const actual = matchedCandidate?.actual;

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

    traceCursor = matchedCandidate.actualIndex + 1;
    matchedSequence += 1;

    const { requestRuleResult, responseRuleResult, allRulesPassed, isSuccessStatus } = matchedCandidate;

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

    if (isSuccessStatus && allRulesPassed) {
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
    sequenceScore: baseWeights.sequenceScore,
    resultScore: baseWeights.resultScore,
    conversationStateScore: baseWeights.conversationStateScore,
    contentScore: contentScore === undefined ? undefined : baseWeights.contentScore,
    tokenEfficiencyScore: tokenEfficiencyScore === undefined ? undefined : baseWeights.tokenEfficiencyScore,
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
