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
        {notes.sections.map((section) => {
          const flagSummary = buildStudentFacingFlagSummary(section.uncertaintyFlags);

          return (
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
              <StructuredNotesContent content={section.content} />
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
                {flagSummary.length > 0 ? (
                  <ul className="review-list note-item__flag-summary">
                    {flagSummary.map((item) => (
                      <li className="review-summary__pill" key={`${section.id}-${item.source}`}>
                        {item.label}: {item.count}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta">No notable note-quality issues for this section.</p>
                )}
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StructuredNotesContent({ content }: { content: string }) {
  const lines = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return <p className="meta">No notes available.</p>;
  }

  const title = lines[0];
  const sections = parseNoteSections(lines.slice(1));

  return (
    <div className="note-structured">
      <h5 className="note-structured__title">{title}</h5>
      {sections.map((section) => (
        <div className="note-structured__section" key={section.heading}>
          <h6>{section.heading}</h6>
          <ul>
            {section.items.map((item) => (
              <li key={item.text}>
                {item.text}
                {item.children.length > 0 ? (
                  <ul>
                    {item.children.map((child) => (
                      <li key={child}>{child}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface ParsedNoteItem {
  text: string;
  children: string[];
}

interface ParsedNoteSection {
  heading: string;
  items: ParsedNoteItem[];
}

function parseNoteSections(lines: string[]): ParsedNoteSection[] {
  const sections: ParsedNoteSection[] = [];
  let currentSection: ParsedNoteSection | null = null;

  for (const line of lines) {
    if (line.startsWith("- ")) {
      if (!currentSection) {
        currentSection = { heading: "Notes", items: [] };
        sections.push(currentSection);
      }

      currentSection.items.push({ text: line.slice(2).trim(), children: [] });
      continue;
    }

    if (line.startsWith("  - ")) {
      const lastItem = currentSection?.items.at(-1);
      if (lastItem) {
        lastItem.children.push(line.slice(4).trim());
      }
      continue;
    }

    currentSection = { heading: line.trim(), items: [] };
    sections.push(currentSection);
  }

  return sections;
}

function buildStudentFacingFlagSummary(
  flags: NonNullable<SessionDetailView["finalNotes"]>["sections"][number]["uncertaintyFlags"],
): Array<{ source: string; label: string; count: number }> {
  const visibleFlags = flags.filter((flag) => {
    if (flag.source === "ocr" || flag.source === "vision" || flag.source === "image") {
      return false;
    }
    if (/todo/i.test(flag.message)) {
      return false;
    }
    return flag.source === "notes" || flag.source === "transcript";
  });

  const counts = new Map<string, number>();
  for (const flag of visibleFlags) {
    counts.set(flag.source, (counts.get(flag.source) ?? 0) + 1);
  }

  return [...counts.entries()].map(([source, count]) => ({
    source,
    label: source === "notes" ? "Note quality flags" : "Transcript caveats",
    count,
  }));
}
