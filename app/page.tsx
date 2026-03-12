import { getCaseRepository } from "@/src/server/cases/case-repository";
import { getRunRepository } from "@/src/server/runtime";
import { RunConsole } from "@/app/components/run-console";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const cases = getCaseRepository().listCases();
  const runs = getRunRepository().listRuns();

  return (
    <main className="page-shell">
      <section className="page-hero">
        <p className="page-kicker">Evaluation Console</p>
        <div className="page-title-row">
          <div>
            <h1
              className="page-title"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Dify Skills Evaluator
            </h1>
            <p className="page-copy">
              Run a case, inspect what the agent actually did, and understand
              why the score landed where it did without digging through raw
              artifacts first.
            </p>
          </div>
          <div className="page-note">
            Choose a scenario, bind the target app credentials, launch the run,
            then review the live session and final trace from the same workflow.
          </div>
        </div>
      </section>
      <RunConsole cases={cases} initialRuns={runs} />
    </main>
  );
}
