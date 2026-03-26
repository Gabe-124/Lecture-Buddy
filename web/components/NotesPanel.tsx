import Link from "next/link";

import type { SessionDetailView } from "@/lib/api-contracts";

import { buildTranscriptHref, formatClockFromMs } from "@/lib/format";

interface NotesPanelProps {
  bundle: SessionDetailView;
}

export function NotesPanel({ bundle }: NotesPanelProps) {
  const notes = bundle.finalNotes;

  if (!notes) {
    return (
      <section className="card card--compact panel-card panel-card--empty panel-card--notes">
        <div className="panel-header">
          <div>
            <span className="badge">Notes</span>
            <h3>Study notes</h3>
          </div>
        </div>
        <div className="empty-state empty-state--quiet">
          <p>No notes yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card panel-card panel-card--notes">
      <div className="panel-header">
        <div>
          <span className="badge">Notes</span>
          <h3>Study notes</h3>
        </div>
        <p className="meta">{notes.sections.length} sections ready</p>
      </div>

      <div className="notes-list">
        {notes.sections.map((section) => (
          <article className="note-item" key={section.id}>
            <div className="note-item__header">
              <div>
                <h4>{section.title}</h4>
                <div className="inline-links">
                  <span className="badge">{section.mode ?? "unknown mode"}</span>
                  <Link
                    className="timestamp-link"
                    href={buildTranscriptHref(
                      bundle.session.id,
                      section.transcriptSegmentIds[0],
                    )}
                  >
                    {formatClockFromMs(section.startMs)} to {formatClockFromMs(section.endMs)}
                  </Link>
                </div>
              </div>
            </div>
            <p>{section.content}</p>
            <details className="note-item__details">
              <summary>Evidence and references</summary>
              <div className="evidence-row">
                <span className="meta">
                  Transcript refs: {section.transcriptSegmentIds.length}
                </span>
                <span className="meta">Image refs: {section.imageIds.length}</span>
                <span className="meta">OCR refs: {section.ocrResultIds.length}</span>
                <span className="meta">Vision refs: {section.visionResultIds.length}</span>
              </div>
              {section.uncertaintyFlags.length > 0 ? (
                <ul className="flag-list">
                  {section.uncertaintyFlags.map((flag) => (
                    <li className={`flag flag--${flag.severity}`} key={`${section.id}-${flag.kind}`}>
                      <strong>{flag.severity}</strong> {flag.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="meta">No review issues for this section.</p>
              )}
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
