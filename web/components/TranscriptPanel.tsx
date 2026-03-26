import Link from "next/link";

import type { CapturedImage, TranscriptSegment } from "@/lib/shared-types";

import {
  buildImageHref,
  buildTranscriptHref,
  formatClockFromMs,
  formatConfidence,
} from "@/lib/format";

interface TranscriptPanelProps {
  audioChunkCount?: number;
  processingJobStatus?: string | null;
  sessionId: string;
  segments: TranscriptSegment[];
  images: CapturedImage[];
}

export function TranscriptPanel({
  audioChunkCount = 0,
  processingJobStatus = null,
  sessionId,
  segments,
  images,
}: TranscriptPanelProps) {
  const imagesById = new Map(images.map((image) => [image.id, image]));
  const isEmpty = segments.length === 0;

  return (
    <section
      className={
        isEmpty
          ? "card card--compact panel-card panel-card--empty panel-card--transcript"
          : "card panel-card panel-card--transcript"
      }
    >
      <div className="panel-header">
        <div>
          <span className="badge">Transcript</span>
          <h3>Supporting transcript</h3>
        </div>
        {segments.length > 0 ? <p className="meta">{segments.length} saved moments</p> : <p className="meta">Not ready yet</p>}
      </div>

      {isEmpty ? (
        <div className="empty-state empty-state--quiet">
          <p>No transcript yet.</p>
        </div>
      ) : null}

      <div className="transcript-list">
        {segments.map((segment) => (
          <article
            className={segment.isPrimarySpeaker === false ? "transcript-row transcript-row--secondary" : "transcript-row"}
            id={`segment-${segment.id}`}
            key={segment.id}
          >
            <div className="transcript-row__meta">
              <Link className="timestamp-link" href={buildTranscriptHref(sessionId, segment.id)}>
                {formatClockFromMs(segment.startMs)}
              </Link>
              <span className="meta">{segment.speakerId ?? "unknown speaker"}</span>
              <span className="meta">Confidence {formatConfidence(segment.confidence)}</span>
            </div>

            <p>{segment.text}</p>

            {segment.linkedImageIds?.length ? (
              <div className="inline-links">
                {segment.linkedImageIds.map((imageId) => {
                  const image = imagesById.get(imageId);

                  return (
                    <Link href={buildImageHref(sessionId, imageId)} key={imageId}>
                      Linked image {image?.sequenceNumber ?? imageId}
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {segment.uncertaintyFlags.length > 0 ? (
              <details className="transcript-row__details">
                <summary>{segment.uncertaintyFlags.length} transcript note{segment.uncertaintyFlags.length === 1 ? "" : "s"}</summary>
                <ul className="flag-list">
                  {segment.uncertaintyFlags.map((flag) => (
                    <li className={`flag flag--${flag.severity}`} key={`${segment.id}-${flag.kind}`}>
                      <strong>{flag.source}</strong> {flag.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
