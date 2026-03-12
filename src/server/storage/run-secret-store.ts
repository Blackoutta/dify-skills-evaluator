import type { TargetAppBinding } from "@/src/server/types/contracts";

export interface RunSecretStore {
  setRunBindings(runId: string, bindings: TargetAppBinding[]): void;
  getBinding(runId: string, appAlias: string): TargetAppBinding | undefined;
  clearRun(runId: string): void;
}

export function createRunSecretStore(): RunSecretStore {
  const store = new Map<string, Map<string, TargetAppBinding>>();

  return {
    setRunBindings(runId, bindings) {
      store.set(
        runId,
        new Map(bindings.map((binding) => [binding.appAlias, { ...binding }])),
      );
    },
    getBinding(runId, appAlias) {
      return store.get(runId)?.get(appAlias);
    },
    clearRun(runId) {
      store.delete(runId);
    },
  };
}

let singleton: RunSecretStore | undefined;

export function getRunSecretStore(): RunSecretStore {
  singleton ??= createRunSecretStore();
  return singleton;
}
