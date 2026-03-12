"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { CSSProperties } from "react";

import type { EvaluationRunResult, NormalizedBody } from "@/src/server/types/contracts";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: 18,
        border: "1px solid #bcae94",
        background: "rgba(255,255,255,0.62)",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h3>
      {children}
    </section>
  );
}

function renderBody(body: NormalizedBody | undefined) {
  if (!body) return "No body";
  return JSON.stringify(body, null, 2);
}

function InfoTooltip({ label, description }: { label: string; description: string }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-label={`${label} description`}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1px solid #1f1d18",
          background: "#1f1d18",
          color: "#f5f1e8",
          fontSize: 12,
          fontWeight: 700,
          cursor: "help",
          flexShrink: 0,
          padding: 0,
        }}
      >
        i
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            left: 28,
            top: "50%",
            transform: "translateY(-50%)",
            width: 280,
            padding: "10px 12px",
            border: "1px solid #1f1d18",
            background: "#1f1d18",
            color: "#f5f1e8",
            fontSize: 13,
            lineHeight: 1.4,
            zIndex: 20,
            boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
          }}
        >
          {description}
        </span>
      ) : null}
    </span>
  );
}

const preStyle: CSSProperties = {
  margin: 0,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const metricMeta = {
  sequenceScore: {
    label: "Expected Calls",
    description: "How well the run matched the required API call path, method, app, and order.",
  },
  resultScore: {
    label: "Request Accuracy",
    description: "Whether matched calls returned success and satisfied the expected request and response rules.",
  },
  conversationStateScore: {
    label: "State Reuse",
    description: "Whether state like conversation_id was correctly carried from one turn to the next.",
  },
  contentScore: {
    label: "Response Content",
    description: "Whether the response text matched explicit content checks such as contains or regex rules.",
  },
  tokenEfficiencyScore: {
    label: "Token Efficiency",
    description: "How efficiently the runner stayed within the test case token budget. Lower token use scores better.",
  },
} as const;

type MetricKey = keyof typeof metricMeta;

function formatWeightedPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function findingAppliesToMetric(metricKey: MetricKey, message: string, code: string): boolean {
  if (metricKey === "sequenceScore") {
    return code === "sequence_mismatch" || code === "missing_trace_step";
  }

  if (metricKey === "resultScore") {
    return [
      "request_rule_failed",
      "response_rule_failed",
      "variable_extraction_failed",
      "missing_trace_step",
      "sequence_mismatch",
    ].includes(code);
  }

  if (metricKey === "conversationStateScore") {
    return (
      message.includes("conversation_id") ||
      message.includes("missing variable conversation_id")
    );
  }

  if (metricKey === "contentScore") {
    return (
      message.includes("expected to contain") ||
      message.includes("contains_variable") ||
      message.includes("failed regex")
    );
  }

  if (metricKey === "tokenEfficiencyScore") {
    return code === "token_budget_exceeded";
  }

  return false;
}

function summarizeFinding(message: string): string {
  return message
    .replace(/^([a-z_]+)\s+(request|response)\s+rules failed:\s*/i, "")
    .replace(/^Missing trace for step\s+/i, "Missing expected step: ")
    .replace(/^Step\s+/i, "")
    .trim();
}

function buildScoreWeights(result: EvaluationRunResult) {
  const storedWeights = result.score.weights;
  if (storedWeights) {
    return storedWeights;
  }

  const hasContentScore = result.score.breakdown.contentScore !== undefined;
  const hasTokenEfficiencyScore = result.score.breakdown.tokenEfficiencyScore !== undefined;
  if (hasContentScore && hasTokenEfficiencyScore) {
    return {
      sequenceScore: 35,
      resultScore: 25,
      conversationStateScore: 15,
      contentScore: 10,
      tokenEfficiencyScore: 15,
    };
  }

  if (hasTokenEfficiencyScore) {
    return {
      sequenceScore: 38.89,
      resultScore: 27.78,
      conversationStateScore: 16.67,
      contentScore: undefined,
      tokenEfficiencyScore: 16.67,
    };
  }

  if (hasContentScore) {
    return {
      sequenceScore: 41.18,
      resultScore: 29.41,
      conversationStateScore: 17.65,
      contentScore: 11.76,
      tokenEfficiencyScore: undefined,
    };
  }

  return {
    sequenceScore: 46.67,
    resultScore: 33.33,
    conversationStateScore: 20,
    contentScore: undefined,
    tokenEfficiencyScore: undefined,
  };
}

export function RunResultView({ result }: { result: EvaluationRunResult }) {
  const weights = buildScoreWeights(result);
  const metrics = [
    {
      key: "sequenceScore",
      score: result.score.breakdown.sequenceScore,
      weight: weights.sequenceScore,
      ...metricMeta.sequenceScore,
    },
    {
      key: "resultScore",
      score: result.score.breakdown.resultScore,
      weight: weights.resultScore,
      ...metricMeta.resultScore,
    },
    {
      key: "conversationStateScore",
      score: result.score.breakdown.conversationStateScore,
      weight: weights.conversationStateScore,
      ...metricMeta.conversationStateScore,
    },
    ...(result.score.breakdown.contentScore === undefined
      ? []
      : [
          {
            key: "contentScore",
            score: result.score.breakdown.contentScore,
            weight: weights.contentScore ?? 0,
            ...metricMeta.contentScore,
          },
        ]),
    ...(result.score.breakdown.tokenEfficiencyScore === undefined
      ? []
      : [
          {
            key: "tokenEfficiencyScore",
            score: result.score.breakdown.tokenEfficiencyScore,
            weight: weights.tokenEfficiencyScore ?? 0,
            ...metricMeta.tokenEfficiencyScore,
          },
        ]),
  ].map((metric) => {
    const maxContribution = metric.weight;
    const contribution = Math.round(((metric.score / 100) * metric.weight) * 100) / 100;
    const lostContribution = Math.round((maxContribution - contribution) * 100) / 100;
    const relatedFindings = result.score.findings.filter((finding) =>
      findingAppliesToMetric(metric.key as MetricKey, finding.message, finding.code),
    );

    return {
      ...metric,
      contribution,
      maxContribution,
      lostContribution,
      relatedFindings,
    };
  });
  const formula = metrics.map((metric) => `${metric.label} ${metric.weight}% x ${metric.score}`).join(" + ");
  const totalLost = Math.round((100 - result.score.totalScore) * 100) / 100;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Section title="Run Summary">
        <div style={{ display: "grid", gap: 6 }}>
          <div>
            <strong>Run ID:</strong>{" "}
            <Link href={`/runs/${result.runId}`}>{result.runId}</Link>
          </div>
          <div>
            <strong>Status:</strong> {result.status}
          </div>
          <div>
            <strong>Case:</strong> {result.testCaseId}
          </div>
          <div>
            <strong>Total Score:</strong> {result.score.totalScore}
          </div>
          <div>
            <strong>Created:</strong> {result.createdAt}
          </div>
          {result.runner.usage ? (
            <div>
              <strong>Token Usage:</strong> {result.runner.usage.totalTokens ?? "unknown"} total
              {result.runner.usage.inputTokens !== undefined ? `, ${result.runner.usage.inputTokens} input` : ""}
              {result.runner.usage.cachedInputTokens !== undefined
                ? ` (${result.runner.usage.cachedInputTokens} cached)`
                : ""}
              {result.runner.usage.outputTokens !== undefined ? `, ${result.runner.usage.outputTokens} output` : ""}
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Score Breakdown">
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: 12,
              border: "1px solid #d6cab5",
              background: "#faf7f0",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Weighted Formula</div>
            <div title={`Total Score = ${formula}`}>{formula}</div>
            <div style={{ marginTop: 6, color: "#5b5346" }}>
              Total lost: {formatWeightedPoints(totalLost)} points
            </div>
          </div>
          {metrics.map((metric) => (
            <div
              key={metric.key}
              style={{
                padding: "10px 12px",
                border: "1px solid #d6cab5",
                background: "#fffdf8",
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <strong>{metric.label}</strong>
                  <InfoTooltip label={metric.label} description={metric.description} />
                </div>
                <div>
                  {metric.score} / 100
                  {"  "}
                  <span style={{ color: "#5b5346" }}>({metric.weight}% weight)</span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 8,
                }}
              >
                <div>
                  <strong>Contribution:</strong> {formatWeightedPoints(metric.contribution)} /{" "}
                  {formatWeightedPoints(metric.maxContribution)}
                </div>
                <div>
                  <strong>Lost:</strong> {formatWeightedPoints(metric.lostContribution)} points
                </div>
              </div>

              {metric.lostContribution > 0 ? (
                <div
                  style={{
                    padding: 10,
                    border: "1px solid #e0c7a2",
                    background: "#fff6ea",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>What went wrong</div>
                  {metric.relatedFindings.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {metric.relatedFindings.map((finding, index) => (
                        <li key={`${metric.key}-${finding.code}-${index}`}>
                          {summarizeFinding(finding.message)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div>No detailed finding was attached to this metric.</div>
                  )}
                </div>
              ) : (
                <div style={{ color: "#46624a" }}>No points lost for this metric.</div>
              )}
            </div>
          ))}
        </div>
        {result.score.findings.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <strong>Findings</strong>
            <ul style={{ marginBottom: 0 }}>
              {result.score.findings.map((finding, index) => (
                <li key={`${finding.code}-${index}`}>
                  [{finding.severity}] {finding.message}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ marginBottom: 0 }}>No findings.</p>
        )}
      </Section>

      <Section title="Extracted Variables">
        {Object.keys(result.variables).length === 0 ? (
          <p style={{ margin: 0 }}>No extracted variables.</p>
        ) : (
          <pre style={preStyle}>
            {JSON.stringify(result.variables, null, 2)}
          </pre>
        )}
      </Section>

      <Section title="Trace Timeline">
        <div style={{ display: "grid", gap: 14 }}>
          {result.trace.map((step) => (
            <div
              key={step.id}
              style={{
                border: "1px solid #d6cab5",
                background: "#faf7f0",
                padding: 14,
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <strong>
                  Step {step.stepIndex}: {step.appAlias} {step.request.method}{" "}
                  {step.request.path}
                </strong>
              </div>
              <div style={{ marginBottom: 8 }}>Status: {step.response.status}</div>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Request Body</div>
                  <pre style={preStyle}>
                    {renderBody(step.request.body)}
                  </pre>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Response Body</div>
                  <pre style={preStyle}>
                    {renderBody(step.response.body)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
