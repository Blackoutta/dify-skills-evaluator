"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type {
  EvaluationRunResult,
  EvaluationTestCase,
  SessionListEntry,
  StartEvaluationInput,
  TargetAppBinding,
} from "@/src/server/types/contracts";
import { TimestampText } from "@/app/components/timestamp-text";

interface BindingFormState {
  appAlias: string;
  appType: TargetAppBinding["appType"];
  apiKey: string;
  user: string;
}

interface RunSessionView {
  runId: string;
  testCaseId: string;
  skillPath: string;
  status: "queued" | "running" | "completed" | "failed" | "timed_out";
  createdAt: string;
  updatedAt: string;
  logs: string[];
  error?: string;
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
        color: "oklch(38% 0.08 72)",
        background: "oklch(92% 0.05 82)",
        borderColor: "oklch(74% 0.08 76)",
      };
    case "running":
      return {
        color: "oklch(35% 0.05 132)",
        background: "oklch(92% 0.04 132)",
        borderColor: "oklch(73% 0.07 132)",
      };
    case "completed":
      return {
        color: "oklch(33% 0.06 136)",
        background: "oklch(92% 0.04 136)",
        borderColor: "oklch(71% 0.08 136)",
      };
    case "failed":
      return {
        color: "oklch(34% 0.07 30)",
        background: "oklch(91% 0.05 28)",
        borderColor: "oklch(69% 0.08 28)",
      };
    case "timed_out":
      return {
        color: "oklch(37% 0.08 64)",
        background: "oklch(91% 0.06 72)",
        borderColor: "oklch(72% 0.09 70)",
      };
  }
}

function sessionEntryFromResult(run: EvaluationRunResult): SessionListEntry {
  return {
    runId: run.runId,
    testCaseId: run.testCaseId,
    skillPath: run.skillPath,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.runner.endedAt,
    isActive: false,
    result: run,
  };
}

function sessionEntryFromLiveSession(session: RunSessionView): SessionListEntry {
  return {
    runId: session.runId,
    testCaseId: session.testCaseId,
    skillPath: session.skillPath,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    isActive: isLiveSessionStatus(session.status),
    result: session.result,
  };
}

function upsertSessionEntry(current: SessionListEntry[], entry: SessionListEntry): SessionListEntry[] {
  return [entry, ...current.filter((session) => session.runId !== entry.runId)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
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
  const router = useRouter();
  const [selectedRunner, setSelectedRunner] = useState<StartEvaluationInput["runnerKind"]>("codex");
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.id ?? "");
  const [skillPath, setSkillPath] = useState("");
  const [defaultUser, setDefaultUser] = useState("eval-user-001");
  const [realDifyBaseUrl, setRealDifyBaseUrl] = useState("");
  const [bindingsByCaseId, setBindingsByCaseId] = useState<Record<string, BindingFormState[]>>(
    cases[0] ? { [cases[0].id]: bindingStateFromCase(cases[0], "eval-user-001") } : {},
  );
  const [sessionItems, setSessionItems] = useState<SessionListEntry[]>(
    initialRuns.map(sessionEntryFromResult),
  );
  const [activeSession, setActiveSession] = useState<RunSessionView | null>(null);
  const [lastViewedRunId, setLastViewedRunId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionMenuRunId, setActionMenuRunId] = useState<string | null>(null);
  const [submittingCaseIds, setSubmittingCaseIds] = useState<Record<string, boolean>>({});
  const [deletingRunIds, setDeletingRunIds] = useState<Record<string, boolean>>({});
  const [cooldownDeadlineByCaseId, setCooldownDeadlineByCaseId] = useState<Record<string, number>>({});
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("run");
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

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
  const activeRunCount = sessionItems.filter((session) => session.isActive).length;

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
    if (typeof window === "undefined" || !hasLoadedPersistedState || activeTab !== "sessions") return;

    let cancelled = false;

    async function loadSessionItems() {
      try {
        const response = await fetch("/api/runs/sessions", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Failed to load sessions");
        }
        const data = (await response.json()) as SessionListEntry[];
        if (cancelled) return;
        setSessionItems(data);
        setRecoveryError(null);
      } catch (loadError) {
        if (cancelled) return;
        setRecoveryError(loadError instanceof Error ? loadError.message : "Failed to load sessions");
      }
    }

    void loadSessionItems();
    const timer = window.setInterval(() => {
      void loadSessionItems();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTab, hasLoadedPersistedState]);

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

  useEffect(() => {
    if (!actionMenuRunId) return;

    function handlePointerDown(event: MouseEvent) {
      if (!actionMenuRef.current?.contains(event.target as Node)) {
        setActionMenuRunId(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionMenuRunId(null);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [actionMenuRunId]);

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

  async function handleDeleteFinishedSession(runId: string) {
    if (deletingRunIds[runId]) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this session? This removes its run artifacts from the local evaluator.",
    );
    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setDeletingRunIds((current) => ({ ...current, [runId]: true }));
    try {
      const response = await fetch(`/api/runs/${runId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to delete session");
      }
      setSessionItems((current) => current.filter((session) => session.runId !== runId));
      setLastViewedRunId((current) => (current === runId ? "" : current));
      setActiveSession((current) => (current?.runId === runId ? null : current));
      setActionMenuRunId((current) => (current === runId ? null : current));
    } catch (deleteRunError) {
      setDeleteError(
        deleteRunError instanceof Error ? deleteRunError.message : "Failed to delete session",
      );
    } finally {
      setDeletingRunIds((current) => {
        const next = { ...current };
        delete next[runId];
        return next;
      });
    }
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
      setSessionItems((current) => upsertSessionEntry(current, sessionEntryFromLiveSession(data)));
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

  return (
    <div className="workspace-grid">
      <aside className="panel sidebar-card">
        <div className="panel-inner stack-md">
          <div>
            <p className="eyebrow">Runner</p>
            <h2
              className="panel-title"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Execution mode
            </h2>
            <p className="panel-copy">
              Keep the runner choice lightweight. The main job here is to set up
              a case and evaluate the result quickly.
            </p>
          </div>
          <div className="stack-md">
            {availableRunners.map((runner) => (
              <button
                key={runner.id}
                type="button"
                className="runner-choice"
                onClick={() => setSelectedRunner(runner.id)}
                style={{
                  background:
                    selectedRunner === runner.id ? "#201b14" : "rgba(255,252,246,0.82)",
                  color: selectedRunner === runner.id ? "#f7f1e5" : "#201b14",
                  cursor: "pointer",
                }}
              >
                <strong>{runner.label}</strong>
                <small>{runner.description}</small>
              </button>
            ))}
          </div>
          <div className="note-card">
            <div className="summary-label">Stored locally</div>
            <div className="muted">
              Base URL, skill path, default user, and per-case API keys stay in
              this browser to speed up repeated evaluations.
            </div>
          </div>
        </div>
      </aside>

      <div className="stack-lg">
        <section className="panel">
          <div className="panel-inner stack-md">
            <div className="summary-strip">
              <div className="summary-cell">
                <span className="summary-label">Cases available</span>
                <div className="summary-value">{cases.length}</div>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Saved sessions</span>
                <div className="summary-value">{sessionItems.length}</div>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Active runs</span>
                <div className="summary-value">{activeRunCount}</div>
              </div>
            </div>

            <div className="segmented-row">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="segmented-button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    background:
                      activeTab === tab.id ? "#201b14" : "rgba(255,252,246,0.72)",
                    color: activeTab === tab.id ? "#f7f1e5" : "#625748",
                    borderColor:
                      activeTab === tab.id ? "#201b14" : "rgba(32, 27, 20, 0.16)",
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {activeTab === "run" ? (
          <>
            <section className="panel panel-strong">
              <div className="panel-inner stack-lg">
                <div>
                  <p className="eyebrow">Setup</p>
                  <h2
                    className="panel-title"
                    style={{ fontFamily: "var(--font-display), serif" }}
                  >
                    Prepare the next evaluation
                  </h2>
                  <p className="panel-copy">
                    Start with the scenario, confirm its objective, then supply
                    only the bindings this case actually needs.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="setup-block">
                  <div className="field-grid">
                    <div className="field">
                      <span className="field-label">1. Choose a test case</span>
                      <span className="field-hint">
                        Pick the scenario you want to verify before worrying
                        about environment details.
                      </span>
                      <select
                        value={selectedCaseId}
                        onChange={(event) => setSelectedCaseId(event.target.value)}
                        className="text-select"
                      >
                        {cases.map((testCase) => (
                          <option key={testCase.id} value={testCase.id}>
                            {testCase.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedCase ? (
                      <div className="note-card">
                        <div className="summary-label">Case objective</div>
                        <div style={{ lineHeight: 1.6 }}>{selectedCase.objective}</div>
                        {selectedCase.artifacts?.length ? (
                          <div style={{ marginTop: 14 }}>
                            <div className="summary-label">Artifacts in play</div>
                            <ul className="plain-list">
                              {selectedCase.artifacts.map((artifact) => (
                                <li key={artifact.artifactId}>
                                  {artifact.artifactId}:{" "}
                                  {artifact.displayName ?? artifact.path}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="real-dify-base-url">2. Dify base URL</label>
                      <span className="field-hint">
                        The real target base URL for the proxied app calls.
                      </span>
                      <input
                        id="real-dify-base-url"
                        value={realDifyBaseUrl}
                        onChange={(event) => setRealDifyBaseUrl(event.target.value)}
                        placeholder="https://your-dify.example.com/v1"
                        className="text-input"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="skill-path">3. Skill path</label>
                      <span className="field-hint">
                        Absolute path to the skill under evaluation.
                      </span>
                      <input
                        id="skill-path"
                        value={skillPath}
                        onChange={(event) => setSkillPath(event.target.value)}
                        placeholder="/absolute/path/to/your/skill"
                        className="text-input"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="default-user">4. Default user identity</label>
                    <span className="field-hint">
                      Reused as the default user across bindings unless you
                      override it per app.
                    </span>
                    <input
                      id="default-user"
                      value={defaultUser}
                      onChange={(event) => setDefaultUser(event.target.value)}
                      className="text-input"
                    />
                  </div>

                  <div className="stack-md">
                    <div>
                      <div className="field-label">5. Required app bindings</div>
                      <div className="field-hint">
                        Only the apps required by the selected case are shown
                        here.
                      </div>
                    </div>
                    <div className="stack-md">
                      {bindingState.map((binding) => (
                        <div key={binding.appAlias} className="binding-card">
                          <div className="binding-header" style={{ marginBottom: 12 }}>
                            <div>
                              <h3 className="binding-title">
                                {binding.appAlias}
                              </h3>
                              <div className="muted">{binding.appType}</div>
                            </div>
                            <span className="pill">Required for this case</span>
                          </div>
                          <div className="field-row">
                            <div className="field">
                              <label htmlFor={`api-key-${binding.appAlias}`}>
                                API key
                              </label>
                              <input
                                id={`api-key-${binding.appAlias}`}
                                type="password"
                                value={binding.apiKey}
                                onChange={(event) =>
                                  updateBinding(
                                    binding.appAlias,
                                    "apiKey",
                                    event.target.value,
                                  )
                                }
                                placeholder="app-xxx"
                                className="text-input"
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`user-${binding.appAlias}`}>
                                User
                              </label>
                              <input
                                id={`user-${binding.appAlias}`}
                                value={binding.user}
                                onChange={(event) =>
                                  updateBinding(
                                    binding.appAlias,
                                    "user",
                                    event.target.value,
                                  )
                                }
                                className="text-input"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {error ? <div className="alert alert-danger">{error}</div> : null}

                  {selectedCaseCooldownRemainingMs > 0 ? (
                    <div className="alert alert-neutral">
                      You can rerun{" "}
                      <strong>{caseTitleById[selectedCaseId] ?? selectedCaseId}</strong>{" "}
                      in{" "}
                      <strong>
                        {Math.ceil(selectedCaseCooldownRemainingMs / 1000)}s
                      </strong>
                      . You can still switch cases and launch another one
                      immediately.
                    </div>
                  ) : null}

                  <div className="live-banner">
                    <div>
                      <div className="summary-label">Primary action</div>
                      <div className="muted">
                        Launch the evaluation once the case and bindings look
                        right.
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="button-primary"
                      disabled={
                        isSelectedCaseSubmitting ||
                        selectedCaseCooldownRemainingMs > 0
                      }
                    >
                      {isSelectedCaseSubmitting
                        ? "Starting evaluation..."
                        : selectedCaseCooldownRemainingMs > 0
                          ? `Wait ${Math.ceil(
                              selectedCaseCooldownRemainingMs / 1000,
                            )}s`
                          : "Run evaluation"}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            {activeSession && isLiveSessionStatus(activeSession.status) ? (
              <section className="panel">
                <div className="panel-inner live-banner">
                  <div>
                    <p className="eyebrow">Live session</p>
                    <h2
                      className="panel-title"
                      style={{ fontFamily: "var(--font-display), serif" }}
                    >
                      Current run in progress
                    </h2>
                    <p className="panel-copy">
                      Run <strong>{activeSession.runId}</strong> for{" "}
                      <strong>
                        {caseTitleById[activeSession.testCaseId] ??
                          activeSession.testCaseId}
                      </strong>{" "}
                      has started. Open the sessions view to follow status
                      updates, or open the detail page for live logs.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setActiveTab("sessions")}
                  >
                    Open sessions
                  </button>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="panel">
            <div className="panel-inner stack-md">
              <div>
                <p className="eyebrow">Sessions</p>
                <h2
                  className="panel-title"
                  style={{ fontFamily: "var(--font-display), serif" }}
                >
                  Review runs over time
                </h2>
                <p className="panel-copy">
                  Monitor active work, reopen live logs after a refresh, and
                  jump back into completed reports without losing context.
                </p>
              </div>

              {recoveryError ? (
                <div className="alert alert-danger">{recoveryError}</div>
              ) : null}
              {deleteError ? (
                <div className="alert alert-danger">{deleteError}</div>
              ) : null}

              {sessionItems.length > 0 ? (
                <div className="session-list">
                  {sessionItems.map((session) => {
                    const isSelected = activeSession?.runId === session.runId;
                    const isLastViewed = session.runId === lastViewedRunId;
                    const statusStyles = getStatusStyles(session.status);
                    const isDeleting = deletingRunIds[session.runId] ?? false;
                    const isActionMenuOpen = actionMenuRunId === session.runId;

                    return (
                      <article
                        key={session.runId}
                        className="session-card"
                        style={{
                          borderColor: isLastViewed
                            ? "#201b14"
                            : "rgba(32, 27, 20, 0.12)",
                          borderWidth: isLastViewed ? 2 : 1,
                          background: isSelected
                            ? "#f1e5d2"
                            : "rgba(255,252,246,0.76)",
                          display: "grid",
                          gap: 16,
                          position: "relative",
                          cursor: session.isActive ? "default" : "pointer",
                        }}
                        onClick={() => {
                          if (!session.isActive) {
                            setActionMenuRunId((current) => current === session.runId ? null : session.runId);
                          }
                        }}
                      >
                        {session.isActive ? (
                          <Link
                            href={`/runs/${session.runId}`}
                            onClick={() => setLastViewedRunId(session.runId)}
                            className="session-link"
                          >
                            <div className="binding-header">
                              <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                                <div>
                                  <div className="summary-label">Run ID</div>
                                  <div
                                    style={{
                                      fontFamily: "var(--font-mono), monospace",
                                      fontSize: "0.95rem",
                                    }}
                                  >
                                    {session.runId}
                                  </div>
                                </div>
                                <div>
                                  <h3 className="session-title" style={{ marginBottom: 4 }}>
                                    {caseTitleById[session.testCaseId] ?? session.testCaseId}
                                  </h3>
                                  <div className="muted">Live logs available now</div>
                                  <div
                                    className="muted"
                                    style={{
                                      marginTop: 8,
                                      fontFamily: "var(--font-mono), monospace",
                                      fontSize: 12,
                                      overflowWrap: "anywhere",
                                    }}
                                  >
                                    Skill: {session.skillPath}
                                  </div>
                                </div>
                              </div>

                              <div className="session-meta">
                                <span
                                  className="status-badge"
                                  style={{
                                    borderColor: statusStyles.borderColor,
                                    background: statusStyles.background,
                                    color: statusStyles.color,
                                  }}
                                >
                                  {session.status.replace("_", " ")}
                                </span>
                                <div>Created: <TimestampText value={session.createdAt} /></div>
                                <div>Updated: <TimestampText value={session.updatedAt} /></div>
                                <div>{isLastViewed ? "Last viewed" : "Open live logs"}</div>
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="binding-header">
                            <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                              <div>
                                <div className="summary-label">Run ID</div>
                                <div
                                  style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    fontSize: "0.95rem",
                                  }}
                                >
                                  {session.runId}
                                </div>
                              </div>
                              <div>
                                <h3 className="session-title" style={{ marginBottom: 4 }}>
                                  {caseTitleById[session.testCaseId] ??
                                    session.testCaseId}
                                </h3>
                                <div className="muted">
                                  {session.isActive
                                    ? "Live logs available now"
                                    : "Completed report ready to inspect"}
                                </div>
                                <div
                                  className="muted"
                                  style={{
                                    marginTop: 8,
                                    fontFamily: "var(--font-mono), monospace",
                                    fontSize: 12,
                                    overflowWrap: "anywhere",
                                  }}
                                >
                                  Skill: {session.skillPath}
                                </div>
                              </div>
                              {!session.isActive && session.result ? (
                                <div className="score-chip">
                                  Score <strong>{session.result.score.totalScore}</strong>
                                </div>
                              ) : null}
                            </div>

                            <div className="session-meta">
                              <span
                                className="status-badge"
                                style={{
                                  borderColor: statusStyles.borderColor,
                                  background: statusStyles.background,
                                  color: statusStyles.color,
                                }}
                              >
                                {session.status.replace("_", " ")}
                              </span>
                              <div>Created: <TimestampText value={session.createdAt} /></div>
                              <div>
                                {session.isActive ? "Updated" : "Finished"}:{" "}
                                <TimestampText value={session.updatedAt} />
                              </div>
                              <div>
                                {isLastViewed ? "Last viewed" : "Click for actions"}
                              </div>
                            </div>
                          </div>
                        )}
                        {!session.isActive && isActionMenuOpen ? (
                          <div
                            ref={actionMenuRef}
                            className="session-action-popover"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="session-action-button"
                              onClick={() => {
                                setLastViewedRunId(session.runId);
                                setActionMenuRunId(null);
                                router.push(`/runs/${session.runId}`);
                              }}
                            >
                              Open report
                            </button>
                            <button
                              type="button"
                              className="session-action-button session-action-danger"
                              onClick={() => void handleDeleteFinishedSession(session.runId)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="note-card">
                  No sessions yet. Run an evaluation first and this area becomes
                  your running history and report index.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
