"use client";

import { useEffect, useRef, useState } from "react";

import type { EvaluationRunResult } from "@/src/server/types/contracts";

import { RunResultView } from "@/app/components/run-result-view";

interface RunSessionView {
  runId: string;
  testCaseId: string;
  status: "queued" | "running" | "completed" | "failed" | "timed_out";
  createdAt: string;
  updatedAt: string;
  logs: string[];
  error?: string;
  result?: EvaluationRunResult;
}

function isLiveSessionStatus(status: RunSessionView["status"]): boolean {
  return status === "queued" || status === "running";
}

export function RunDetailClient({
  runId,
  caseTitleById,
  initialSession,
}: {
  runId: string;
  caseTitleById: Record<string, string>;
  initialSession: RunSessionView | null;
}) {
  const [session, setSession] = useState<RunSessionView | null>(initialSession);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(initialSession === null);
  const logContainerRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    setSession(initialSession);
    setIsLoading(initialSession === null);
  }, [initialSession]);

  useEffect(() => {
    if (!session) return;
    if (!autoScrollLogs) return;
    const element = logContainerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [session?.logs, autoScrollLogs]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch(`/api/runs/${runId}/live`, {
          cache: "no-store",
        });
        const data = (await response.json()) as RunSessionView | { error: string };
        if (!response.ok) {
          throw new Error("error" in data ? data.error : "Failed to load session");
        }
        if ("error" in data) {
          throw new Error(data.error);
        }
        if (cancelled) return;
        setSession(data);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load session");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (!isLiveSessionStatus(session.status)) {
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/runs/${runId}/live`, {
          cache: "no-store",
        });
        const data = (await response.json()) as RunSessionView | { error: string };
        if (!response.ok) {
          throw new Error("error" in data ? data.error : "Failed to load session");
        }
        if ("error" in data) {
          throw new Error(data.error);
        }
        if (cancelled) return;
        setSession(data);
        setError(null);
        if (!isLiveSessionStatus(data.status)) {
          window.clearInterval(timer);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load session");
        window.clearInterval(timer);
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runId, session?.status]);

  if (!session) {
    return (
      <section className="panel">
        <div className="panel-inner">
        <h2
          className="panel-title"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Session detail
        </h2>
        {isLoading ? (
          <div className="note-card">Loading session...</div>
        ) : (
          <div className="alert alert-danger">
            {error ?? "Session not found."}
          </div>
        )}
        </div>
      </section>
    );
  }

  const caseLabel = caseTitleById[session.testCaseId] ?? session.testCaseId;

  return (
    <div className="stack-lg">
      <section className="panel">
        <div className="panel-inner stack-md">
          <div>
            <p className="eyebrow">Overview</p>
            <h2
              className="panel-title"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Session snapshot
            </h2>
          </div>
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Run ID</dt>
              <dd style={{ fontFamily: "var(--font-mono), monospace" }}>
                {session.runId}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Status</dt>
              <dd>{session.status}</dd>
            </div>
            <div className="detail-item">
              <dt>Case</dt>
              <dd>{caseLabel}</dd>
            </div>
            <div className="detail-item">
              <dt>Case ID</dt>
              <dd>{session.testCaseId}</dd>
            </div>
            <div className="detail-item">
              <dt>Created</dt>
              <dd>{new Date(session.createdAt).toLocaleString()}</dd>
            </div>
            <div className="detail-item">
              <dt>Last update</dt>
              <dd>{new Date(session.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack-md">
          <div className="live-banner">
            <div>
              <p className="eyebrow">Logs</p>
              <h2
                className="panel-title"
                style={{ fontFamily: "var(--font-display), serif" }}
              >
                Live session output
              </h2>
              <p className="panel-copy">
                {isLiveSessionStatus(session.status)
                  ? "Logs update automatically while the session is active."
                  : "This session has finished. Logs below are persisted for review."}
              </p>
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={autoScrollLogs}
                onChange={(event) => setAutoScrollLogs(event.target.checked)}
              />
              Auto-scroll logs
            </label>
          </div>
          {error ? (
            <div className="alert alert-danger">{error}</div>
          ) : null}
          {session.error ? (
            <div className="alert alert-danger">{session.error}</div>
          ) : null}
          <pre
            ref={logContainerRef}
            className="log-surface"
            style={{ minHeight: 220, maxHeight: 420 }}
          >
            {session.logs.length > 0 ? session.logs.join("\n") : "Waiting for logs..."}
          </pre>
        </div>
      </section>

      {session.result ? (
        <section className="stack-md">
          <div>
            <p className="eyebrow">Report</p>
            <h2
              className="panel-title"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Evaluation report
            </h2>
            <p className="panel-copy">
              Summary first, details on demand, raw evidence when you need it.
            </p>
          </div>
          <RunResultView result={session.result} />
        </section>
      ) : null}
    </div>
  );
}
