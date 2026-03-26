import Link from "next/link";
import type { ReactNode } from "react";

import type { SessionDetailView } from "@/lib/api-contracts";

import {
  buildSessionHref,
  buildSessionImagesHref,
  buildSessionTranscriptHref,
  formatSessionDate,
  type SessionImagesRoute,
  type SessionRoute,
  type SessionTranscriptRoute,
} from "@/lib/format";

type SessionView = "notes" | "transcript" | "images";

interface SessionDetailProps {
  bundle: SessionDetailView;
  activeView: SessionView;
  primaryPanel: ReactNode;
  secondaryPanels?: ReactNode;
  controlPanel?: ReactNode;
}

export function SessionDetail({
  bundle,
  activeView,
  primaryPanel,
  secondaryPanels,
  controlPanel,
}: SessionDetailProps) {
  const noteCount = bundle.finalNotes?.sections.length ?? 0;
  const reviewCount = bundle.uncertaintyFlags.length;
  const acceptedReceiptCount = bundle.uploadReceipts.filter(
    (receipt) => receipt.status === "accepted",
  ).length;
  const sessionStatusLabel = formatLabel(bundle.session.status);
  const jobStatusLabel = formatLabel(bundle.processingJobStatus ?? "not started");
  const statusTone = getStatusTone(bundle.session.status, bundle.processingJobStatus);
  const notesReady = noteCount > 0;
  const transcriptReady = bundle.transcriptSegments.length > 0;
  const imagesAvailable = bundle.capturedImages.length > 0;
  const summaryMetrics = [
    {
      label: "Notes",
      value: notesReady ? `${noteCount} ready` : "Preparing",
      hint: notesReady ? "ready to study" : "still generating",
      tone: notesReady ? "success" : "default",
    },
    {
      label: "Transcript",
      value: transcriptReady ? `${bundle.transcriptSegments.length} moments` : "Preparing",
      hint: transcriptReady ? "supporting evidence" : "still processing",
      tone: transcriptReady ? "success" : "default",
    },
    {
      label: "Images",
      value: imagesAvailable ? `${bundle.capturedImages.length} captures` : "No captures",
      hint: imagesAvailable ? "only when helpful" : "none yet",
      tone: "default",
    },
    {
      label: "Uploads",
      value: `${bundle.uploadReceipts.length}`,
      hint: `${acceptedReceiptCount} accepted`,
      tone:
        bundle.uploadReceipts.length > 0 && acceptedReceiptCount === bundle.uploadReceipts.length
          ? "success"
          : "default",
    },
    {
      label: "Review",
      value: `${reviewCount}`,
      hint: reviewCount === 0 ? "clear" : "flags",
      tone: reviewCount === 0 ? "success" : "warning",
    },
  ];

  const links: Array<{
    href: SessionRoute | SessionTranscriptRoute | SessionImagesRoute;
    label: string;
    key: SessionView;
  }> = [
    { href: buildSessionHref(bundle.session.id), label: "Notes", key: "notes" },
    {
      href: buildSessionTranscriptHref(bundle.session.id),
      label: "Transcript",
      key: "transcript",
    },
    { href: buildSessionImagesHref(bundle.session.id), label: "Images", key: "images" },
  ];

  return (
    <section className="page-stack session-detail">
      <div className="card hero">
        <div className="hero__top">
          <div className="hero__identity">
            <div className="hero__eyebrow-row">
              <span className="badge badge--hero">Session</span>
              <span className={`status-pill status-pill--${statusTone}`}>{sessionStatusLabel}</span>
            </div>
            <h2 className="hero__title">{bundle.session.title}</h2>
            <div className="hero__meta-row">
              <p className="hero__subtitle">
                {bundle.session.classroomLabel ?? "Classroom TBD"} •{" "}
                {formatSessionDate(bundle.session.startedAt)}
              </p>
            </div>
          </div>
          <div className="hero__aside">
            <div className="hero__status-block">
              <span className="hero__status-kicker">Ready to study</span>
              <strong>{notesReady ? "Notes are ready" : "Notes are processing"}</strong>
              <p className="hero__status-line">
                Transcript {transcriptReady ? "available" : "processing"} • Processing {jobStatusLabel}
              </p>
            </div>
            <div className="hero__links">
              {links.map((link) => (
                <Link
                  className={link.key === activeView ? "tablink tablink--active" : "tablink"}
                  href={link.href}
                  key={link.key}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <details className="hero__details">
              <summary>Technical details</summary>
              <div className="hero__details-grid">
                <span className="meta mono">{bundle.session.id}</span>
                <span className="meta">Primary speaker {bundle.session.primarySpeakerLabel ?? "Unknown"}</span>
                <span className="meta">Modes {bundle.session.modeWindows.length}</span>
                <span className="meta">Upload receipts {bundle.uploadReceipts.length}</span>
                <span className="meta">Pi IP {bundle.session.deviceIpAddress ?? "IP unavailable"}</span>
              </div>
            </details>
          </div>
        </div>

        <div className="summary-strip">
          {summaryMetrics.map((metric) => (
            <div className={`summary-card summary-card--${metric.tone}`} key={metric.label}>
              <span className="summary-card__label">{metric.label}</span>
              <div className="summary-card__value-row">
                <strong>{metric.value}</strong>
                <span className="summary-card__hint">{metric.hint}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {controlPanel}

      {primaryPanel}
      {secondaryPanels}
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

function getStatusTone(
  sessionStatus: string,
  processingJobStatus?: string | null,
): "neutral" | "progress" | "success" | "warning" {
  const combined = `${sessionStatus} ${processingJobStatus ?? ""}`.toLowerCase();

  if (
    combined.includes("failed") ||
    combined.includes("error") ||
    combined.includes("rejected")
  ) {
    return "warning";
  }

  if (
    combined.includes("complete") ||
    combined.includes("completed") ||
    combined.includes("ready") ||
    combined.includes("accepted")
  ) {
    return "success";
  }

  if (
    combined.includes("processing") ||
    combined.includes("running") ||
    combined.includes("queued") ||
    combined.includes("upload")
  ) {
    return "progress";
  }

  return "neutral";
}
