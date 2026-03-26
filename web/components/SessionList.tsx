import Link from "next/link";

import { buildSessionHref, formatSessionDate } from "@/lib/format";
import type { SessionDashboardSummary } from "@/lib/sessionData";

interface SessionListProps {
  summaries: SessionDashboardSummary[];
}

export function SessionList({ summaries }: SessionListProps) {
  return (
    <section className="page-stack">
      <div className="card">
        <div className="panel-header">
          <div>
            <span className="badge">Sessions</span>
            <h2>Your class notes</h2>
          </div>
          <p className="meta">Open any session to read notes first, then transcript and images if needed.</p>
        </div>
        <p className="meta">Status and readiness reflect the latest processed session data.</p>
      </div>

      {summaries.length === 0 ? (
        <div className="card">
          <p className="meta">
            No sessions have been written to Convex yet. Pi uploads and session lifecycle events
            will appear here after deployment.
          </p>
        </div>
      ) : (
        <div className="session-list">
          {summaries.map((summary) => (
            <article className="card session-card" key={summary.session.id}>
              <div className="session-card__top">
                <div className="session-card__badges">
                  <span className="badge">{formatLabel(summary.session.status)}</span>
                  {summary.processingJobStatus ? (
                    <span className="badge badge--subtle">
                      Processing {formatLabel(summary.processingJobStatus)}
                    </span>
                  ) : null}
                </div>
              </div>
              <h3>
                <Link className="session-card__title-link" href={buildSessionHref(summary.session.id)}>
                  {summary.session.title}
                </Link>
              </h3>
              <p className="meta">{summary.session.classroomLabel ?? "Classroom"} • {formatSessionDate(summary.session.startedAt)}</p>

              <div className="readiness-grid">
                <div className="readiness-item">
                  <span className="readiness-item__label">Notes</span>
                  <strong className={summary.noteSectionCount > 0 ? "readiness-ready" : "readiness-pending"}>
                    {summary.noteSectionCount > 0
                      ? `${summary.noteSectionCount} section${summary.noteSectionCount === 1 ? "" : "s"}`
                      : "Preparing"}
                  </strong>
                </div>
                <div className="readiness-item">
                  <span className="readiness-item__label">Transcript</span>
                  <strong
                    className={
                      summary.transcriptSegmentCount > 0 ? "readiness-ready" : "readiness-pending"
                    }
                  >
                    {summary.transcriptSegmentCount > 0
                      ? `${summary.transcriptSegmentCount} moments`
                      : "Preparing"}
                  </strong>
                </div>
                <div className="readiness-item">
                  <span className="readiness-item__label">Images</span>
                  <strong>{summary.capturedImageCount > 0 ? `${summary.capturedImageCount} captures` : "None yet"}</strong>
                </div>
              </div>

              <details className="session-card__details">
                <summary>Technical details</summary>
                <div className="evidence-row">
                  <span className="meta mono">{summary.session.id}</span>
                  <span className="meta">Audio {summary.audioChunkCount}</span>
                  <span className="meta">Receipts {summary.uploadReceiptCount}</span>
                  <span className="meta">Review {summary.uncertaintyCount}</span>
                  <span className="meta">Modes {summary.session.modeWindows.length}</span>
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
