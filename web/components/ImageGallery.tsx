import Link from "next/link";

import type { CapturedImage, OCRResult, VisionResult } from "@/lib/shared-types";

import { buildTranscriptHref, formatConfidence, formatSessionDate } from "@/lib/format";

interface ImageGalleryProps {
  sessionId: string;
  images: CapturedImage[];
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
}

export function ImageGallery({
  sessionId,
  images,
  ocrResults,
  visionResults,
}: ImageGalleryProps) {
  const ocrByImageId = new Map(ocrResults.map((result) => [result.imageId, result]));
  const visionByImageId = new Map(visionResults.map((result) => [result.imageId, result]));

  return (
    <section className="card panel-card panel-card--gallery">
      <div className="panel-header">
        <div>
          <span className="badge">Images</span>
          <h3>Supporting images</h3>
        </div>
        <p className="meta">Shown when they add context to notes or transcript</p>
      </div>

      {images.length === 0 ? (
        <div className="empty-state empty-state--quiet">
          <p>No images yet.</p>
        </div>
      ) : null}

      <div className="image-grid">
        {images.map((image) => {
          const ocr = ocrByImageId.get(image.id);
          const vision = visionByImageId.get(image.id);
          const hasOcr = Boolean(ocr?.text);
          const hasVision = Boolean(vision?.summary);
          const transcriptTarget =
            image.transcriptAnchor?.transcriptSegmentIds[0] ?? image.nearbyTranscriptSegmentIds?.[0];
          const artifactRef = image.storageKey ?? image.localPath ?? null;
          const artifactName = artifactRef
            ? getArtifactName(artifactRef)
            : `image-${image.sequenceNumber}`;
          const previewSrc = resolveRenderableImageSrc(image);
          const combinedFlags = [
            ...(image.uncertaintyFlags ?? []),
            ...(ocr?.uncertaintyFlags ?? []),
            ...(vision?.uncertaintyFlags ?? []),
          ];
          const uploadedAt = image.uploadedAt ?? null;
          const uploadLag =
            uploadedAt && image.capturedAt
              ? formatElapsedTime(image.capturedAt, uploadedAt)
              : null;

          return (
            <article className="image-card" id={`image-${image.id}`} key={image.id}>
              <div
                className={
                  previewSrc
                    ? "artifact-preview artifact-preview--image"
                    : "artifact-preview artifact-preview--placeholder"
                }
              >
                {previewSrc ? (
                  <img
                    alt={`Captured image ${image.sequenceNumber}`}
                    className="artifact-preview__image"
                    src={previewSrc}
                  />
                ) : (
                  <div className="artifact-placeholder">
                    <span className="artifact-placeholder__label">
                      {image.modeHint ?? "captured image"}
                    </span>
                    <strong className="artifact-placeholder__number">
                      {String(image.sequenceNumber).padStart(2, "0")}
                    </strong>
                    <span className="artifact-placeholder__time">
                      {formatSessionDate(image.capturedAt)}
                    </span>
                  </div>
                )}
                {previewSrc ? (
                  <div className="image-card__overlay">
                    <div className="image-card__overlay-top">
                      <span className="image-card__index-badge">
                        Image {String(image.sequenceNumber).padStart(2, "0")}
                      </span>
                      {image.modeHint ? (
                        <span className="image-card__mode-badge">{image.modeHint}</span>
                      ) : null}
                    </div>
                    <div className="image-card__overlay-bottom">
                      <p className="image-card__capture-time">
                        {formatSessionDate(image.capturedAt)}
                      </p>
                      {transcriptTarget ? (
                        <Link
                          className="image-card__overlay-link"
                          href={buildTranscriptHref(sessionId, transcriptTarget)}
                        >
                          Jump to transcript
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="image-card__body">
                <div className="image-card__header">
                  <div className="image-card__header-main">
                    <p className="image-card__title">Capture {String(image.sequenceNumber).padStart(2, "0")}</p>
                    <div className="image-card__subline">
                      {!previewSrc && image.modeHint ? <span className="meta">{image.modeHint}</span> : null}
                      {!previewSrc && transcriptTarget ? (
                        <Link
                          className="timestamp-link"
                          href={buildTranscriptHref(sessionId, transcriptTarget)}
                        >
                          Jump to transcript
                        </Link>
                      ) : !transcriptTarget ? (
                        <span className="meta">Transcript link pending</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {hasOcr || hasVision ? (
                  <div className="analysis-pill-row">
                    {hasOcr ? (
                      <section className="analysis-pill">
                        <span className="analysis-pill__label">OCR</span>
                        <p>{ocr?.text}</p>
                        <span className="analysis-pill__meta">
                          Confidence {formatConfidence(ocr?.confidence)}
                        </span>
                      </section>
                    ) : null}

                    {hasVision ? (
                      <section className="analysis-pill">
                        <span className="analysis-pill__label">Vision</span>
                        <p>{vision?.summary}</p>
                        <span className="analysis-pill__meta">
                          Confidence {formatConfidence(vision?.confidence)}
                        </span>
                      </section>
                    ) : null}
                  </div>
                ) : null}

                <details className="image-card__details">
                  <summary>Capture details</summary>
                  <div className="image-card__details-grid">
                    <div className="image-detail">
                      <span className="image-detail__label">Processing</span>
                      <strong>
                        {image.acceptedForProcessing ? "Accepted" : "Not accepted"}
                      </strong>
                    </div>
                    <div className="image-detail">
                      <span className="image-detail__label">Uploaded</span>
                      <strong>{uploadedAt ? formatSessionDate(uploadedAt) : "Not uploaded"}</strong>
                    </div>
                    <div className="image-detail">
                      <span className="image-detail__label">Lag</span>
                      <strong>{uploadLag ?? "n/a"}</strong>
                    </div>
                    {artifactRef ? (
                      <div className="image-detail image-detail--wide">
                        <span className="image-detail__label">Filename</span>
                        <strong className="image-card__filename" title={artifactName}>
                          {artifactName}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                  <div className="image-chip-row image-chip-row--details">
                    <div className="image-detail image-detail--chip">
                      <span className="image-detail__label">Diff</span>
                      <strong>{formatMetric(image.diffScore, 2)}</strong>
                    </div>
                    <div className="image-detail image-detail--chip">
                      <span className="image-detail__label">Blur</span>
                      <strong>{formatMetric(image.blurScore, 1)}</strong>
                    </div>
                    <div className="image-detail image-detail--chip">
                      <span className="image-detail__label">Quality</span>
                      <strong>{formatMetric(image.qualityScore, 2)}</strong>
                    </div>
                  </div>
                </details>

                {combinedFlags.length > 0 ? (
                  <ul className="flag-list">
                    {combinedFlags.map((flag, index) => (
                      <li
                        className={`flag flag--${flag.severity}`}
                        key={`${image.id}-${flag.kind}-${index}`}
                      >
                        <strong>{flag.source}</strong> {flag.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getArtifactName(value: string): string {
  const segments = value.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? value;
}

function resolveRenderableImageSrc(image: CapturedImage): string | null {
  const candidate = image.storageKey ?? image.localPath;

  if (!candidate) {
    return null;
  }

  return /^https?:\/\//.test(candidate) ? candidate : null;
}

function formatMetric(value: number | undefined, digits: number): string {
  return value === undefined ? "n/a" : value.toFixed(digits);
}

function formatElapsedTime(start: string, end: string): string {
  const deltaMs = new Date(end).getTime() - new Date(start).getTime();

  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return "n/a";
  }

  const totalSeconds = Math.round(deltaMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
