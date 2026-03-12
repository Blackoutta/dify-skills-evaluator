"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type {
  EvaluationRunResult,
  EvaluationTestCase,
  StartEvaluationInput,
  TargetAppBinding,
} from "@/src/server/types/contracts";

interface BindingFormState {
  appAlias: string;
  appType: TargetAppBinding["appType"];
  apiKey: string;
  user: string;
}

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

interface ActiveRunSessionSummary {
  runId: string;
  testCaseId: string;
  status: "queued" | "running";
  createdAt: string;
  updatedAt: string;
}

interface SessionListItem {
  runId: string;
  testCaseId: string;
  status: RunSessionView["status"];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  result?: EvaluationRunResult;
}

interface PersistedRunConsoleState {
  selectedRunner: StartEvaluationInput["runnerKind"];
  selectedCaseId: string;
  skillPath: string;
  defaultUser: string;
  realDifyBaseUrl: string;
  bindingsByCaseId: Record<string, BindingFormState[]>;
  lastViewedRunId: string;
}

const STORAGE_KEY = "dify-evaluator-run-console";
const availableRunners = [
  {
    id: "codex",
    label: "Codex",
    description: "Current default runner for evaluation tasks.",
  },
] as const;
const RESTART_COOLDOWN_MS = 3000;
const tabs = [
  { id: "run", label: "Run A Case" },
  { id: "sessions", label: "Sessions" },
] as const;

function isLiveSessionStatus(status: RunSessionView["status"]): boolean {
  return status === "queued" || status === "running";
}

function getStatusStyles(status: RunSessionView["status"]) {
  switch (status) {
    case "queued":
      return {
        color: "#7a4d12",
        background: "#f5e7c8",
        borderColor: "#d8b57b",
      };
    case "running":
      return {
        color: "#0f4c5c",
        background: "#d8eef2",
        borderColor: "#7cb8c7",
      };
    case "completed":
      return {
        color: "#285b2a",
        background: "#dff1df",
        borderColor: "#8fc28f",
      };
    case "failed":
      return {
        color: "#7b261a",
        background: "#f4d8d3",
        borderColor: "#d29b92",
      };
    case "timed_out":
      return {
        color: "#7a3d00",
        background: "#f8dfc2",
        borderColor: "#d9a46a",
      };
  }
}

function bindingStateFromCase(testCase: EvaluationTestCase, defaultUser: string): BindingFormState[] {
  return testCase.requiredApps.map((app) => ({
    appAlias: app.appAlias,
    appType: app.appType,
    apiKey: "",
    user: defaultUser,
  }));
}

function normalizeBindingsForCase(
  testCase: EvaluationTestCase,
  defaultUser: string,
  bindings?: BindingFormState[],
): BindingFormState[] {
  const bindingsByAlias = new Map(bindings?.map((binding) => [binding.appAlias, binding]) ?? []);

  return testCase.requiredApps.map((app) => {
    const existing = bindingsByAlias.get(app.appAlias);
    return {
      appAlias: app.appAlias,
      appType: app.appType,
      apiKey: existing?.apiKey ?? "",
      user: existing?.user ?? defaultUser,
    };
  });
}

export function RunConsole({
  cases,
  initialRuns,
}: {
  cases: EvaluationTestCase[];
  initialRuns: EvaluationRunResult[];
}) {
  const [selectedRunner, setSelectedRunner] = useState<StartEvaluationInput["runnerKind"]>("codex");
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.id ?? "");
  const [skillPath, setSkillPath] = useState("");
  const [defaultUser, setDefaultUser] = useState("eval-user-001");
  const [realDifyBaseUrl, setRealDifyBaseUrl] = useState("");
  const [bindingsByCaseId, setBindingsByCaseId] = useState<Record<string, BindingFormState[]>>(
    cases[0] ? { [cases[0].id]: bindingStateFromCase(cases[0], "eval-user-001") } : {},
  );
  const [runs, setRuns] = useState(initialRuns);
  const [activeSession, setActiveSession] = useState<RunSessionView | null>(null);
  const [recoverableSessions, setRecoverableSessions] = useState<ActiveRunSessionSummary[]>([]);
  const [lastViewedRunId, setLastViewedRunId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [submittingCaseIds, setSubmittingCaseIds] = useState<Record<string, boolean>>({});
  const [cooldownDeadlineByCaseId, setCooldownDeadlineByCaseId] = useState<Record<string, number>>({});
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("run");
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);

  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? cases[0];
  const bindingState = selectedCase
    ? normalizeBindingsForCase(selectedCase, defaultUser, bindingsByCaseId[selectedCase.id])
    : [];
  const caseTitleById = Object.fromEntries(cases.map((testCase) => [testCase.id, testCase.title]));
  const selectedCaseCooldownRemainingMs = Math.max(
    0,
    (cooldownDeadlineByCaseId[selectedCaseId] ?? 0) - cooldownNow,
  );
  const isSelectedCaseSubmitting = submittingCaseIds[selectedCaseId] ?? false;
  const activeRunIds = new Set(recoverableSessions.map((session) => session.runId));
  const orderedSessionItems: SessionListItem[] = [
    ...recoverableSessions.map((session) => ({
      runId: session.runId,
      testCaseId: session.testCaseId,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      sortTime: session.updatedAt,
      isActive: true,
    })),
    ...runs
      .filter((run) => !activeRunIds.has(run.runId))
      .map((run) => ({
        runId: run.runId,
        testCaseId: run.testCaseId,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.runner.endedAt,
        isActive: false,
        result: run,
      })),
  ].sort((a, b) => {
    return b.createdAt.localeCompare(a.createdAt);
  });

  useEffect(() => {
    if (typeof window === "undefined" || cases.length === 0) return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const persisted = JSON.parse(raw) as PersistedRunConsoleState;

      const resolvedCaseId = cases.some((item) => item.id === persisted.selectedCaseId)
        ? persisted.selectedCaseId
        : cases[0].id;
      const resolvedDefaultUser = persisted.defaultUser || "eval-user-001";
      const resolvedCase = cases.find((item) => item.id === resolvedCaseId) ?? cases[0];
      const persistedBindings = persisted.bindingsByCaseId?.[resolvedCaseId];

      setSelectedRunner(persisted.selectedRunner || "codex");
      setSelectedCaseId(resolvedCaseId);
      setSkillPath(persisted.skillPath || "");
      setDefaultUser(resolvedDefaultUser);
      setRealDifyBaseUrl(persisted.realDifyBaseUrl || "");
      setLastViewedRunId(persisted.lastViewedRunId || "");
      setBindingsByCaseId(() => ({
        ...Object.fromEntries(
          cases.map((testCase) => [
            testCase.id,
            normalizeBindingsForCase(
              testCase,
              resolvedDefaultUser,
              persisted.bindingsByCaseId?.[testCase.id],
            ),
          ]),
        ),
        [resolvedCase.id]: normalizeBindingsForCase(resolvedCase, resolvedDefaultUser, persistedBindings),
      }));
    } catch {
      // Ignore invalid local storage and fall back to defaults.
    } finally {
      setHasLoadedPersistedState(true);
    }
  }, [cases]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "sessions") {
      setActiveTab("sessions");
    }
  }, []);

  useEffect(() => {
    if (!selectedCase) return;
    setBindingsByCaseId((current) => ({
      ...current,
      [selectedCase.id]: normalizeBindingsForCase(selectedCase, defaultUser, current[selectedCase.id]),
    }));
  }, [selectedCase, defaultUser]);

  useEffect(() => {
    setBindingsByCaseId((current) =>
      Object.fromEntries(
        Object.entries(current).map(([caseId, bindings]) => [
          caseId,
          bindings.map((binding) => ({
            ...binding,
            user: defaultUser,
          })),
        ]),
      ),
    );
  }, [defaultUser]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedPersistedState) return;

    const nextState: PersistedRunConsoleState = {
      selectedRunner,
      selectedCaseId,
      skillPath,
      defaultUser,
      realDifyBaseUrl,
      bindingsByCaseId,
      lastViewedRunId,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }, [
    selectedRunner,
    selectedCaseId,
    skillPath,
    defaultUser,
    realDifyBaseUrl,
    bindingsByCaseId,
    lastViewedRunId,
    hasLoadedPersistedState,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedPersistedState) return;

    let cancelled = false;

    async function loadRecoverableSessions() {
      try {
        const response = await fetch("/api/runs/active", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Failed to load active runs");
        }
        const data = (await response.json()) as ActiveRunSessionSummary[];
        if (cancelled) return;
        setRecoverableSessions(data);
        setRecoveryError(null);
      } catch (loadError) {
        if (cancelled) return;
        setRecoveryError(loadError instanceof Error ? loadError.message : "Failed to load active runs");
      }
    }

    void loadRecoverableSessions();

    return () => {
      cancelled = true;
    };
  }, [hasLoadedPersistedState]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setCooldownNow(now);
      setCooldownDeadlineByCaseId((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([, deadline]) => deadline > now),
        );
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

  function updateBinding(appAlias: string, key: keyof BindingFormState, value: string) {
    if (!selectedCase) return;

    setBindingsByCaseId((current) => ({
      ...current,
      [selectedCase.id]: normalizeBindingsForCase(selectedCase, defaultUser, current[selectedCase.id]).map(
        (binding) =>
          binding.appAlias === appAlias ? { ...binding, [key]: value } : binding,
      ),
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isSelectedCaseSubmitting || selectedCaseCooldownRemainingMs > 0) {
      return;
    }

    const submittingCaseId = selectedCaseId;
    setSubmittingCaseIds((current) => ({ ...current, [submittingCaseId]: true }));

    const payload: StartEvaluationInput = {
      runnerKind: selectedRunner,
      skillPath,
      testCaseId: submittingCaseId,
      defaultUser,
      appBindings: bindingState.map(
        (binding) =>
          ({
            appAlias: binding.appAlias,
            appType: binding.appType,
            realDifyBaseUrl,
            apiKey: binding.apiKey,
            user: binding.user,
          }) satisfies TargetAppBinding,
      ),
    };

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as RunSessionView | { error: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to run case");
      }
      if ("error" in data) {
        throw new Error(data.error);
      }
      setActiveSession(data);
      setLastViewedRunId(data.runId);
      setCooldownDeadlineByCaseId((current) => ({
        ...current,
        [submittingCaseId]: Date.now() + RESTART_COOLDOWN_MS,
      }));
      setRecoverableSessions((current) => [
        {
          runId: data.runId,
          testCaseId: data.testCaseId,
          status: data.status === "queued" ? "queued" : "running",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        },
        ...current.filter((session) => session.runId !== data.runId),
      ]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown error");
    } finally {
      setSubmittingCaseIds((current) => {
        const next = { ...current };
        delete next[submittingCaseId];
        return next;
      });
    }
  }

  useEffect(() => {
    if (!activeSession || !["queued", "running"].includes(activeSession.status)) {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/runs/${activeSession.runId}/live`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 404) {
          const fallbackResponse = await fetch(`/api/runs/${activeSession.runId}`, {
            cache: "no-store",
          });
          if (fallbackResponse.ok) {
            const result = (await fallbackResponse.json()) as EvaluationRunResult;
            setRuns((current) => [
              result,
              ...current.filter((item) => item.runId !== result.runId),
            ]);
            setActiveSession((current) =>
              current
                ? {
                    ...current,
                    testCaseId: result.testCaseId,
                    status: result.status,
                    result,
                  }
                : current,
            );
            window.clearInterval(timer);
          }
        }
        return;
      }
      const session = (await response.json()) as RunSessionView;
      setActiveSession(session);
      setLastViewedRunId(session.runId);
      if (session.result) {
        setRuns((current) => [session.result!, ...current.filter((item) => item.runId !== session.result!.runId)]);
      }
      setRecoverableSessions((current) =>
        ["queued", "running"].includes(session.status)
          ? [
              {
                runId: session.runId,
                testCaseId: session.testCaseId,
                status: session.status as "queued" | "running",
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
              },
              ...current.filter((item) => item.runId !== session.runId),
            ]
          : current.filter((item) => item.runId !== session.runId),
      );
      if (!["queued", "running"].includes(session.status)) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeSession?.runId, activeSession?.status]);

  return (
    <div
      style={{
        display: "grid",
        gap: 24,
        gridTemplateColumns: "220px minmax(0, 1fr)",
        alignItems: "start",
      }}
    >
      <aside
        style={{
          padding: 18,
          border: "1px solid #bcae94",
          background: "rgba(255,255,255,0.56)",
          position: "sticky",
          top: 24,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Runner</div>
        <div style={{ display: "grid", gap: 10 }}>
          {availableRunners.map((runner) => (
            <button
              key={runner.id}
              type="button"
              onClick={() => setSelectedRunner(runner.id)}
              style={{
                textAlign: "left",
                padding: 12,
                border: "1px solid #1f1d18",
                background: selectedRunner === runner.id ? "#1f1d18" : "#f5f1e8",
                color: selectedRunner === runner.id ? "#f5f1e8" : "#1f1d18",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700 }}>{runner.label}</div>
              <div style={{ fontSize: 13, marginTop: 4, opacity: 0.86 }}>{runner.description}</div>
            </button>
          ))}
        </div>
      </aside>

      <div style={{ display: "grid", gap: 24 }}>
        <section
          style={{
            padding: 10,
            border: "1px solid #bcae94",
            background: "rgba(255,255,255,0.56)",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 14px",
                border: "1px solid #1f1d18",
                background: activeTab === tab.id ? "#1f1d18" : "#f5f1e8",
                color: activeTab === tab.id ? "#f5f1e8" : "#1f1d18",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </section>

        {activeTab === "run" ? (
          <>
            <section
              style={{
                padding: 22,
                border: "1px solid #bcae94",
                background: "rgba(255,255,255,0.56)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Run A Case</h2>
              <p style={{ marginTop: 0, marginBottom: 16, color: "#5b5346" }}>
                Real Dify Base URL, Skill Path, selected runner, and per-test-case API keys are saved locally in this browser.
              </p>
              <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Real Dify Base URL</span>
                  <input
                    value={realDifyBaseUrl}
                    onChange={(event) => setRealDifyBaseUrl(event.target.value)}
                    placeholder="https://your-dify.example.com/v1"
                    style={{ padding: 10 }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Skill Path</span>
                  <input
                    value={skillPath}
                    onChange={(event) => setSkillPath(event.target.value)}
                    placeholder="/absolute/path/to/your/skill"
                    style={{ padding: 10 }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Default User</span>
                  <input
                    value={defaultUser}
                    onChange={(event) => setDefaultUser(event.target.value)}
                    style={{ padding: 10 }}
                  />
                </label>

                <section
                  style={{
                    display: "grid",
                    gap: 0,
                    padding: 0,
                    border: "2px solid #1f1d18",
                    background: "#f3ebdd",
                    overflow: "hidden",
                  }}
                >
                    <div
                      style={{
                        padding: 18,
                        background: "#1f1d18",
                        color: "#f5f1e8",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
                        Test Case Setup
                      </div>
                      <div style={{ color: "#d7cfbf", fontSize: 14 }}>
                        Choose the scenario, review its objective, and provide the app bindings required for this case.
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        padding: 18,
                        borderTop: "2px solid #d6cab5",
                        background: "transparent",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 18 }}>Test Case</span>
                      <span style={{ color: "#5b5346", fontSize: 14 }}>
                        Choose the evaluation scenario to run.
                      </span>
                      <select
                        value={selectedCaseId}
                        onChange={(event) => setSelectedCaseId(event.target.value)}
                        style={{
                          padding: 12,
                          border: "1px solid #1f1d18",
                          background: "#fffdf8",
                          fontSize: 16,
                        }}
                      >
                        {cases.map((testCase) => (
                          <option key={testCase.id} value={testCase.id}>
                            {testCase.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedCase ? (
                      <div
                        style={{
                          padding: 18,
                          borderTop: "1px solid #d6cab5",
                          background: "rgba(255,255,255,0.28)",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Case Objective</div>
                        <div style={{ marginBottom: 12 }}>{selectedCase.objective}</div>
                        {selectedCase.artifacts?.length ? (
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Artifacts</div>
                            <ul style={{ margin: 0 }}>
                              {selectedCase.artifacts.map((artifact) => (
                                <li key={artifact.artifactId}>
                                  {artifact.artifactId}: {artifact.displayName ?? artifact.path}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: "grid",
                        gap: 0,
                        borderTop: "1px solid #d6cab5",
                      }}
                    >
                      {bindingState.map((binding) => (
                        <div
                          key={binding.appAlias}
                          style={{
                            padding: 18,
                            background: "transparent",
                            display: "grid",
                            gap: 10,
                            borderTop: "1px solid #e4d7c0",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            App Binding: {binding.appAlias} ({binding.appType})
                          </div>
                          <label style={{ display: "grid", gap: 6 }}>
                            <span>API Key</span>
                            <input
                              type="password"
                              value={binding.apiKey}
                              onChange={(event) =>
                                updateBinding(binding.appAlias, "apiKey", event.target.value)
                              }
                              placeholder="app-xxx"
                              style={{ padding: 10 }}
                            />
                          </label>
                          <label style={{ display: "grid", gap: 6 }}>
                            <span>User</span>
                            <input
                              value={binding.user}
                              onChange={(event) =>
                                updateBinding(binding.appAlias, "user", event.target.value)
                              }
                              style={{ padding: 10 }}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                </section>

                {error ? (
                  <div
                    style={{
                      padding: 12,
                      border: "1px solid #8b3b2e",
                      background: "#f5d7ce",
                      color: "#4d1e16",
                    }}
                  >
                    {error}
                  </div>
                ) : null}

                {selectedCaseCooldownRemainingMs > 0 ? (
                  <div
                    style={{
                      padding: 12,
                      border: "1px solid #bcae94",
                      background: "#faf7f0",
                      color: "#5b5346",
                    }}
                  >
                    You can rerun <strong>{caseTitleById[selectedCaseId] ?? selectedCaseId}</strong> in{" "}
                    <strong>{Math.ceil(selectedCaseCooldownRemainingMs / 1000)}s</strong>. You can still switch cases and launch another one immediately.
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isSelectedCaseSubmitting || selectedCaseCooldownRemainingMs > 0}
                  style={{
                    padding: "12px 16px",
                    border: "1px solid #1f1d18",
                    background:
                      isSelectedCaseSubmitting || selectedCaseCooldownRemainingMs > 0 ? "#c6bda9" : "#1f1d18",
                    color: "#f5f1e8",
                    cursor:
                      isSelectedCaseSubmitting || selectedCaseCooldownRemainingMs > 0 ? "wait" : "pointer",
                  }}
                >
                  {isSelectedCaseSubmitting
                    ? "Starting..."
                    : selectedCaseCooldownRemainingMs > 0
                      ? `Wait ${Math.ceil(selectedCaseCooldownRemainingMs / 1000)}s`
                      : "Run Test Case"}
                </button>
              </form>
            </section>

            {activeSession && isLiveSessionStatus(activeSession.status) ? (
              <section
                style={{
                  padding: 18,
                  border: "1px solid #1f1d18",
                  background: "#f3ebdd",
                }}
              >
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Run is active</div>
                      <div style={{ color: "#5b5346" }}>
                        Run <strong>{activeSession.runId}</strong> for{" "}
                        <strong>{caseTitleById[activeSession.testCaseId] ?? activeSession.testCaseId}</strong> is currently{" "}
                        <strong>{activeSession.status}</strong>.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("sessions")}
                      style={{
                        padding: "10px 14px",
                        border: "1px solid #1f1d18",
                        background: "#1f1d18",
                        color: "#f5f1e8",
                        cursor: "pointer",
                      }}
                    >
                      View In Sessions
                    </button>
                  </div>
                  <div style={{ color: "#5b5346", fontSize: 14 }}>
                    Live logs and completed reports now live in the Sessions tab, where you can switch between running and finished sessions.
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div style={{ display: "grid", gap: 24 }}>
            <section
              style={{
                padding: 22,
                border: "1px solid #bcae94",
                background: "rgba(255,255,255,0.56)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Sessions</h2>
              <p style={{ marginTop: 0, color: "#5b5346" }}>
                Monitor running tasks, reopen them after a refresh, and review completed session reports in one place.
              </p>
              {recoveryError ? (
                <div
                  style={{
                    padding: 12,
                    border: "1px solid #8b3b2e",
                    background: "#f5d7ce",
                    color: "#4d1e16",
                    marginBottom: 12,
                  }}
                >
                  {recoveryError}
                </div>
              ) : null}
              {orderedSessionItems.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {orderedSessionItems.map((session) => {
                    const isSelected = activeSession?.runId === session.runId;
                    const isLastViewed = session.runId === lastViewedRunId;
                    const statusStyles = getStatusStyles(session.status);

                    return (
                      <Link
                        key={session.runId}
                        href={`/runs/${session.runId}`}
                        onClick={() => setLastViewedRunId(session.runId)}
                        style={{
                          textAlign: "left",
                          padding: 14,
                          border: isLastViewed ? "2px solid #1f1d18" : "1px solid #d6cab5",
                          background: isSelected ? "#efe4d1" : "#faf7f0",
                          cursor: "pointer",
                          color: "inherit",
                          textDecoration: "none",
                          display: "block",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 24,
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gap: 8,
                              flex: "1 1 420px",
                              minWidth: 0,
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{session.runId}</div>
                            <div>{caseTitleById[session.testCaseId] ?? session.testCaseId}</div>
                            {!session.isActive && session.result ? (
                              <div>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "6px 12px",
                                    border: "1px solid #d2b666",
                                    background: "#fff3c8",
                                    color: "#6e4c00",
                                    fontWeight: 700,
                                  }}
                                >
                                  <span style={{ opacity: 0.85 }}>Score</span>
                                  <span style={{ fontSize: 26, lineHeight: 1 }}>
                                    {session.result.score.totalScore}
                                  </span>
                                </span>
                              </div>
                            ) : null}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gap: 10,
                              textAlign: "right",
                              color: "#5b5346",
                              justifyItems: "end",
                              flex: "0 0 320px",
                              width: 320,
                              maxWidth: "100%",
                              marginLeft: "auto",
                              alignContent: "start",
                            }}
                          >
                            <div
                              style={{
                                padding: "4px 10px",
                                border: `1px solid ${statusStyles.borderColor}`,
                                background: statusStyles.background,
                                color: statusStyles.color,
                                fontWeight: 700,
                                textTransform: "capitalize",
                              }}
                            >
                              {session.status.replace("_", " ")}
                            </div>
                            <div>
                              Created: {new Date(session.createdAt).toLocaleString()}
                            </div>
                            <div>
                              {session.isActive ? "Updated" : "Finished"}:{" "}
                              {new Date(session.updatedAt).toLocaleString()}
                            </div>
                            <div>
                              {isLastViewed ? "Last viewed" : session.isActive ? "Open live logs" : "Open report"}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p style={{ marginBottom: 0 }}>No sessions yet.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
