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
    <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link
          href="/?tab=sessions"
          style={{
            color: "#f5f1e8",
            background: "#1f1d18",
            textDecoration: "none",
            padding: "10px 14px",
            border: "1px solid #1f1d18",
          }}
        >
          Back to Sessions
        </Link>
      </div>
      <h1 style={{ marginBottom: 8 }}>Session Detail</h1>
      <p style={{ marginTop: 0 }}>
        Live logs and the final report for run <strong>{runId}</strong>.
      </p>
      <RunDetailClient runId={runId} caseTitleById={caseTitleById} initialSession={initialSession} />
    </main>
  );
}
