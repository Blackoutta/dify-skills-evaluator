"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import type {
  EvaluationRunResult,
  NormalizedBody,
  TokenBudget,
} from "@/src/server/types/contracts";
import { TimestampText } from "@/app/components/timestamp-text";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-inner">
        <h3
          className="panel-title"
          style={{
            marginBottom: description ? 6 : 12,
            fontFamily: "var(--font-display), serif",
            fontSize: "1.3rem",
          }}
        >
          {title}
        </h3>
        {description ? <p className="panel-copy" style={{ marginBottom: 16 }}>{description}</p> : null}
        {children}
      </div>
    </section>
  );
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Mixed";
  if (score >= 40) return "Fragile";
  return "Needs work";
}

function scoreSummary(score: number): string {
  if (score >= 90) return "The run stayed aligned with the expected flow and landed cleanly.";
  if (score >= 75) return "The run mostly worked, with a few issues worth tightening.";
  if (score >= 60) return "The run completed, but the evaluator found meaningful gaps.";
  if (score >= 40) return "The run is unstable and likely needs prompt or logic changes.";
  return "The run missed core expectations and should be treated as a failing baseline.";
}

function summarizeTopFinding(result: EvaluationRunResult): string {
  if (result.score.findings.length === 0) {
    return "No findings were attached. This run has a clean evaluator report.";
  }

  const topFinding = result.score.findings[0];
  return summarizeFinding(topFinding.message);
}

function renderSeverityLabel(severity: string): string {
  return severity.replace(/_/g, " ");
}

function renderPreBlock(content: string, light = false) {
  return (
    <pre className={`code-surface ${light ? "code-surface-light" : ""}`}>
      {content}
    </pre>
  );
}

function renderJsonBlock(value: unknown, light = false) {
  return renderPreBlock(JSON.stringify(value, null, 2), light);
}

function getTopLossMetric(
  metrics: Array<{
    label: string;
    lostContribution: number;
  }>,
) {
  return metrics.reduce((highest, metric) => {
    if (!highest || metric.lostContribution > highest.lostContribution) {
      return metric;
    }
    return highest;
  }, null as { label: string; lostContribution: number } | null);
}

function compactPath(path: string): string {
  return path.length > 72 ? `${path.slice(0, 69)}...` : path;
}

function Divider() {
  return <div className="panel-divider" style={{ margin: "18px 0" }} />;
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function FindingsList({
  findings,
}: {
  findings: EvaluationRunResult["score"]["findings"];
}) {
  if (findings.length === 0) {
    return <div className="muted">No findings for this run.</div>;
  }

  return (
    <ul className="findings-list">
      {findings.map((finding, index) => (
        <li key={`${finding.code}-${index}`}>
          <strong>{renderSeverityLabel(finding.severity)}:</strong> {finding.message}
        </li>
      ))}
    </ul>
  );
}

function MetricSummary({
  label,
  description,
  score,
  weight,
  contribution,
  maxContribution,
  lostContribution,
  relatedFindings,
  detailRows,
}: {
  label: string;
  description: string;
  score: number;
  weight: number;
  contribution: number;
  maxContribution: number;
  lostContribution: number;
  relatedFindings: EvaluationRunResult["score"]["findings"];
  detailRows?: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <details className="disclosure metric-card">
      <summary>
        <div className="summary-row">
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <strong>{label}</strong>
              <InfoTooltip label={label} description={description} />
            </div>
            <div className="muted">{description}</div>
          </div>
          <div className="pill-row">
            <span className="pill">{score} / 100</span>
            <span className="pill">{weight}% weight</span>
            <span className="pill">
              Lost {formatWeightedPoints(lostContribution)} pts
            </span>
          </div>
        </div>
      </summary>
      <div className="disclosure-content">
        <div className="detail-grid" style={{ marginBottom: 14 }}>
          <InfoRow
            label="Contribution"
            value={`${formatWeightedPoints(contribution)} / ${formatWeightedPoints(
              maxContribution,
            )}`}
          />
          <InfoRow
            label="Points lost"
            value={`${formatWeightedPoints(lostContribution)} points`}
          />
          {detailRows?.map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
        {relatedFindings.length > 0 ? (
          <>
            <div className="summary-label">What went wrong</div>
            <ul className="findings-list">
              {relatedFindings.map((finding, index) => (
                <li key={`${label}-${finding.code}-${index}`}>
                  {summarizeFinding(finding.message)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="muted">
            No detailed finding was attached to this metric.
          </div>
        )}
      </div>
    </details>
  );
}

function TraceDisclosure({
  step,
}: {
  step: EvaluationRunResult["trace"][number];
}) {
  return (
    <details className="disclosure trace-card">
      <summary>
        <div className="summary-row">
          <div style={{ display: "grid", gap: 6 }}>
            <strong>
              Step {step.stepIndex}: {step.appAlias} {step.request.method}
            </strong>
            <div className="muted">{compactPath(step.request.path)}</div>
          </div>
          <div className="pill-row">
            <span className="pill">HTTP {step.response.status}</span>
          </div>
        </div>
      </summary>
      <div className="disclosure-content">
        <div className="trace-meta">
          Full path:{" "}
          <span style={{ fontFamily: "var(--font-mono), monospace" }}>
            {step.request.path}
          </span>
        </div>
        <div className="stack-md">
          <div>
            <div className="summary-label">Request body</div>
            {renderPreBlock(renderBody(step.request.body), true)}
          </div>
          <div>
            <div className="summary-label">Response body</div>
            {renderPreBlock(renderBody(step.response.body), true)}
          </div>
        </div>
      </div>
    </details>
  );
}

export function RunResultView({
  result,
  tokenBudget,
}: {
  result: EvaluationRunResult;
  tokenBudget?: TokenBudget;
}) {
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
  const topLossMetric = getTopLossMetric(metrics);
  const topFinding = summarizeTopFinding(result);

  return (
    <div className="result-hero">
      <Section
        title="Run Verdict"
        description="Start here for the top-line read before drilling into scoring math and raw trace data."
      >
        <div className="verdict-grid">
          <div className="verdict-card">
            <div className="verdict-label">Total score</div>
            <div
              className="verdict-score"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              {result.score.totalScore}
            </div>
            <div style={{ fontSize: "1.1rem", marginTop: 10 }}>
              <strong>{scoreLabel(result.score.totalScore)}</strong>
            </div>
            <p className="panel-copy" style={{ marginTop: 10 }}>
              {scoreSummary(result.score.totalScore)}
            </p>
          </div>

          <div className="verdict-card">
            <div className="verdict-label">Primary issue</div>
            <div style={{ fontSize: "1.05rem", lineHeight: 1.45 }}>{topFinding}</div>
          </div>

          <div className="verdict-card">
            <div className="verdict-label">Largest score drop</div>
            <div style={{ fontSize: "1.05rem", lineHeight: 1.45 }}>
              {topLossMetric && topLossMetric.lostContribution > 0
                ? `${topLossMetric.label} lost ${formatWeightedPoints(
                    topLossMetric.lostContribution,
                  )} points`
                : "No major score loss detected"}
            </div>
          </div>
        </div>

        <Divider />

        <dl className="detail-grid">
          <InfoRow label="Run ID" value={<Link href={`/runs/${result.runId}`}>{result.runId}</Link>} />
          <InfoRow label="Status" value={result.status} />
          <InfoRow label="Case" value={result.testCaseId} />
          <InfoRow label="Created" value={<TimestampText value={result.createdAt} />} />
          <InfoRow
            label="Token usage"
            value={
              result.runner.usage
                ? `${result.runner.usage.totalTokens ?? "unknown"} total${
                    result.runner.usage.inputTokens !== undefined
                      ? `, ${result.runner.usage.inputTokens} input`
                      : ""
                  }${
                    result.runner.usage.cachedInputTokens !== undefined
                      ? ` (${result.runner.usage.cachedInputTokens} cached)`
                      : ""
                  }${
                    result.runner.usage.outputTokens !== undefined
                      ? `, ${result.runner.usage.outputTokens} output`
                      : ""
                  }`
                : "No usage data attached"
            }
          />
          <InfoRow
            label="Findings"
            value={`${result.score.findings.length} attached`}
          />
        </dl>
      </Section>

      <Section
        title="Score Breakdown"
        description="Open the metrics that matter. Each panel shows how much weight it carried and what caused point loss."
      >
        <div className="note-card" style={{ marginBottom: 16 }}>
          <div className="summary-label">Weighted formula</div>
          <div style={{ lineHeight: 1.6 }}>{formula}</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Total lost: {formatWeightedPoints(totalLost)} points
          </div>
        </div>
        <div className="details-list">
          {metrics.map((metric) => (
            <MetricSummary
              key={metric.key}
              label={metric.label}
              description={metric.description}
              score={metric.score}
              weight={metric.weight}
              contribution={metric.contribution}
              maxContribution={metric.maxContribution}
              lostContribution={metric.lostContribution}
              relatedFindings={metric.relatedFindings}
              detailRows={
                metric.key === "tokenEfficiencyScore" && tokenBudget
                  ? [
                      {
                        label: "Actual used tokens",
                        value: result.runner.usage?.totalTokens?.toLocaleString() ?? "Unknown",
                      },
                      {
                        label: "Target tokens",
                        value: tokenBudget.targetTotalTokens.toLocaleString(),
                      },
                      {
                        label: "Max tokens",
                        value: (tokenBudget.maxTotalTokens ?? tokenBudget.targetTotalTokens * 2).toLocaleString(),
                      },
                    ]
                  : undefined
              }
            />
          ))}
        </div>

        <Divider />

        <div className="summary-label">All findings</div>
        <FindingsList findings={result.score.findings} />
      </Section>

      <Section
        title="Variables"
        description="Captured values that can be reused or inspected after the run."
      >
        {Object.keys(result.variables).length === 0 ? (
          <div className="note-card">No extracted variables for this run.</div>
        ) : (
          renderJsonBlock(result.variables, true)
        )}
      </Section>

      <Section
        title="Trace Timeline"
        description="Each request is collapsed by default so you can scan the flow first and open only the steps that matter."
      >
        <div className="details-list">
          {result.trace.map((step) => (
            <TraceDisclosure key={step.id} step={step} />
          ))}
        </div>
      </Section>
    </div>
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
