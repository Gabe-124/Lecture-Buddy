import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { NotesPanel } from "../components/NotesPanel";
import { TranscriptPanel } from "../components/TranscriptPanel";
import { ImageGallery } from "../components/ImageGallery";
import { UncertaintyPanel } from "../components/UncertaintyPanel";

type Tab = "notes" | "transcript" | "images" | "flags";

interface Props {
  sessionId: Id<"sessions">;
  onBack: () => void;
}

export function SessionDetail({ sessionId, onBack }: Props) {
  const session = useQuery(api.sessions.getWithStats, { sessionId });
  const [activeTab, setActiveTab] = useState<Tab>("notes");

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (session === null) {
    return <div className="p-8 text-center text-gray-500">Session not found.</div>;
  }

  const tabs: { id: Tab; label: string; count?: number; warn?: boolean }[] = [
    { id: "notes", label: "Notes", count: session.stats.noteCount },
    { id: "transcript", label: "Transcript", count: session.stats.transcriptCount },
    { id: "images", label: "Images", count: session.stats.imageCount },
    {
      id: "flags",
      label: "Review Needed",
      count: session.stats.unresolvedFlags,
      warn: session.stats.unresolvedFlags > 0,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Back + header */}
      <div className="mb-4">
        <button
          onClick={onBack}
          className="text-sm text-indigo-600 hover:text-indigo-800 mb-3 flex items-center gap-1"
        >
          ← Back to courses
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{session.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span>
                {new Date(session.startedAt).toLocaleDateString(undefined, {
                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                })}
              </span>
              {session.durationSeconds && (
                <span>· {Math.round(session.durationSeconds / 60)} min</span>
              )}
              <StatusBadge status={session.status} progress={session.processingProgress} />
            </div>
          </div>
        </div>
      </div>

      {/* Processing notice */}
      {session.status === "processing" && (
        <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 flex items-center gap-2">
          <span className="animate-spin">⚙️</span>
          Processing in progress ({session.processingProgress ?? 0}%)… Notes and transcript will appear when ready.
          {/* TODO: show per-job status from session.recentJobs */}
        </div>
      )}

      {/* Uncertainty banner */}
      {session.stats.unresolvedFlags > 0 && (
        <button
          onClick={() => setActiveTab("flags")}
          className="w-full mb-4 px-4 py-2.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800 flex items-center gap-2 hover:bg-amber-100 transition-colors text-left"
        >
          <span>⚠️</span>
          <span>
            <strong>{session.stats.unresolvedFlags} item{session.stats.unresolvedFlags !== 1 ? "s" : ""}</strong> need review — low confidence or unclear audio detected.
          </span>
          <span className="ml-auto text-amber-600 font-medium">View →</span>
        </button>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === tab.id
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                  tab.warn
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div>
        {activeTab === "notes" && <NotesPanel sessionId={sessionId} />}
        {activeTab === "transcript" && <TranscriptPanel sessionId={sessionId} />}
        {activeTab === "images" && <ImageGallery sessionId={sessionId} />}
        {activeTab === "flags" && <UncertaintyPanel sessionId={sessionId} />}
      </div>
    </div>
  );
}

function StatusBadge({ status, progress }: { status: string; progress?: number }) {
  const styles: Record<string, string> = {
    ready: "bg-green-100 text-green-700",
    processing: "bg-yellow-100 text-yellow-700",
    recording: "bg-red-100 text-red-700",
    error: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    ready: "Ready",
    processing: `Processing${progress ? ` ${progress}%` : ""}`,
    recording: "Recording",
    error: "Error",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}
