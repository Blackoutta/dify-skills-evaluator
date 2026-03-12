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
      <section
        style={{
          padding: 22,
          border: "1px solid #bcae94",
          background: "rgba(255,255,255,0.56)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Session Detail</h2>
        {isLoading ? (
          <p style={{ marginBottom: 0 }}>Loading session...</p>
        ) : (
          <div
            style={{
              padding: 12,
              border: "1px solid #8b3b2e",
              background: "#f5d7ce",
              color: "#4d1e16",
            }}
          >
            {error ?? "Session not found."}
          </div>
        )}
      </section>
    );
  }

  const caseLabel = caseTitleById[session.testCaseId] ?? session.testCaseId;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section
        style={{
          padding: 22,
          border: "1px solid #bcae94",
          background: "rgba(255,255,255,0.56)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Session Overview</h2>
        <div style={{ display: "grid", gap: 6 }}>
          <div>
            <strong>Run ID:</strong> {session.runId}
          </div>
          <div>
            <strong>Case:</strong> {caseLabel}
          </div>
          <div>
            <strong>Case ID:</strong> {session.testCaseId}
          </div>
          <div>
            <strong>Status:</strong> {session.status}
          </div>
          <div>
            <strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}
          </div>
          <div>
            <strong>Last Update:</strong> {new Date(session.updatedAt).toLocaleString()}
          </div>
        </div>
      </section>

      <section
        style={{
          padding: 22,
          border: "1px solid #bcae94",
          background: "rgba(255,255,255,0.56)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Session Logs</h2>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: "#5b5346" }}>
            {isLiveSessionStatus(session.status)
              ? "Logs update automatically while the session is active."
              : "This session has finished. Logs below are persisted for review."}
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
          <div
            style={{
              padding: 12,
              border: "1px solid #8b3b2e",
              background: "#f5d7ce",
              color: "#4d1e16",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        ) : null}
        {session.error ? (
          <div
            style={{
              padding: 12,
              border: "1px solid #8b3b2e",
              background: "#f5d7ce",
              color: "#4d1e16",
              marginBottom: 12,
            }}
          >
            {session.error}
          </div>
        ) : null}
        <pre
          ref={logContainerRef}
          style={{
            margin: 0,
            padding: 14,
            minHeight: 180,
            maxHeight: 360,
            overflow: "auto",
            border: "1px solid #d6cab5",
            background: "#11110f",
            color: "#e8ddc8",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {session.logs.length > 0 ? session.logs.join("\n") : "Waiting for logs..."}
        </pre>
      </section>

      {session.result ? (
        <section
          style={{
            padding: 22,
            border: "1px solid #bcae94",
            background: "rgba(255,255,255,0.56)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Session Report</h2>
          <RunResultView result={session.result} />
        </section>
      ) : null}
    </div>
  );
}
