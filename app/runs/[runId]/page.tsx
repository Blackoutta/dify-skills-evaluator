import Link from "next/link";

import { RunDetailClient } from "@/app/components/run-detail-client";
import { getCaseRepository } from "@/src/server/cases/case-repository";
import { getRunManager, getRunRepository } from "@/src/server/runtime";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const session = getRunManager().get(runId);
  const repository = getRunRepository();
  const result = repository.readRunResult(runId);

  const caseTitleById = Object.fromEntries(
    getCaseRepository().listCases().map((testCase) => [testCase.id, testCase.title]),
  );
  const initialSession = session
    ? session
    : result
      ? {
          runId,
          testCaseId: result.testCaseId,
          status: result.status,
          createdAt: result.createdAt,
          updatedAt: result.runner.endedAt,
          logs: repository.readProgressLogLines(runId),
          result,
        }
      : null;

  return (
    <main className="page-shell">
      <div style={{ marginBottom: 18, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link
          href="/?tab=sessions"
          className="button-secondary"
          style={{ textDecoration: "none" }}
        >
          Back to Sessions
        </Link>
      </div>
      <section className="page-hero">
        <p className="page-kicker">Session Detail</p>
        <div className="page-title-row">
          <div>
            <h1
              className="page-title"
              style={{ fontFamily: "var(--font-display), serif", maxWidth: "unset" }}
            >
              Review run {runId}
            </h1>
            <p className="page-copy">
              Follow live logs while the session runs, then drop straight into a
              structured report once scoring is complete.
            </p>
          </div>
          <div className="page-note">
            This page combines the operator view and evaluator report so you do
            not need to jump between raw artifacts and summary UI.
          </div>
        </div>
      </section>
      <RunDetailClient runId={runId} caseTitleById={caseTitleById} initialSession={initialSession} />
    </main>
  );
}
