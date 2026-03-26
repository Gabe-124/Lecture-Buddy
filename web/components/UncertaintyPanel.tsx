import type { UncertaintyFlag } from "@/lib/shared-types";

interface UncertaintyPanelProps {
  flags: UncertaintyFlag[];
}

export function UncertaintyPanel({ flags }: UncertaintyPanelProps) {
  if (flags.length === 0) {
    return (
      <section className="card card--compact review-card review-card--clear">
        <div className="review-card__empty">
          <span className="badge">Review</span>
          <strong>All clear</strong>
        </div>
      </section>
    );
  }

  const highCount = flags.filter((flag) => flag.severity === "high").length;
  const mediumCount = flags.filter((flag) => flag.severity === "medium").length;
  const lowCount = flags.filter((flag) => flag.severity === "low").length;

  return (
    <section className="card review-card">
      <div className="panel-header">
        <div>
          <span className="badge">Review</span>
          <h3>Review notes</h3>
        </div>
        <p className="meta">{flags.length} item{flags.length === 1 ? "" : "s"} to review</p>
      </div>

      <div className="review-summary">
        <span className="review-summary__pill">High {highCount}</span>
        <span className="review-summary__pill">Medium {mediumCount}</span>
        <span className="review-summary__pill">Low {lowCount}</span>
      </div>

      <details className="review-card__details">
        <summary>Show detailed review items</summary>
        <ul className="review-list">
          {flags.map((flag, index) => (
            <li className={`flag flag--${flag.severity}`} key={`${flag.kind}-${index}`}>
              <strong>{flag.severity}</strong> {flag.message}
              <span className="meta">
                {flag.source}
                {flag.relatedId ? ` • ${flag.relatedId}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
