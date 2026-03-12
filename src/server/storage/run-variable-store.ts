export interface RunVariableStore {
  setVariables(runId: string, variables: Record<string, string>): void;
  getVariables(runId: string): Record<string, string>;
  clearRun(runId: string): void;
}

export function createRunVariableStore(): RunVariableStore {
  const store = new Map<string, Record<string, string>>();

  return {
    setVariables(runId, variables) {
      const existing = store.get(runId) ?? {};
      store.set(runId, { ...existing, ...variables });
    },
    getVariables(runId) {
      return { ...(store.get(runId) ?? {}) };
    },
    clearRun(runId) {
      store.delete(runId);
    },
  };
}

let singleton: RunVariableStore | undefined;

export function getRunVariableStore(): RunVariableStore {
  singleton ??= createRunVariableStore();
  return singleton;
}
