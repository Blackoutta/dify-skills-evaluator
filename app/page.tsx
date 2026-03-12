import { getCaseRepository } from "@/src/server/cases/case-repository";
import { getRunRepository } from "@/src/server/runtime";
import { RunConsole } from "@/app/components/run-console";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const cases = getCaseRepository().listCases();
  const runs = getRunRepository().listRuns();

  return (
    <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Dify Skills Evaluator</h1>
      <p style={{ marginTop: 0, maxWidth: 760 }}>
        Run cases from the browser by choosing a test case, setting app
        bindings, and observing the result, extracted variables, and trace
        timeline inline.
      </p>
      <RunConsole cases={cases} initialRuns={runs} />
    </main>
  );
}
