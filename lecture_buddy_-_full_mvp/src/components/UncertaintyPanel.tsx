import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  sessionId: Id<"sessions">;
}

const KIND_LABELS: Record<string, string> = {
  low_confidence_transcript: "Low confidence transcript",
  unclear_audio: "Unclear audio",
  ocr_uncertain: "OCR uncertain",
  speaker_unknown: "Unknown speaker",
  content_gap: "Content gap",
  user_flagged: "Manually flagged",
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-50 border-red-300 text-red-800",
  medium: "bg-amber-50 border-amber-300 text-amber-800",
  low: "bg-yellow-50 border-yellow-200 text-yellow-800",
};

const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-yellow-100 text-yellow-700",
};

export function UncertaintyPanel({ sessionId }: Props) {
  const flags = useQuery(api.uncertainty.listBySession, { sessionId, includeResolved: false }) ?? [];
  const resolveFlag = useMutation(api.uncertainty.resolve);
  const [resolving, setResolving] = useState<Id<"uncertaintyFlags"> | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const allFlags = useQuery(api.uncertainty.listBySession, { sessionId, includeResolved: true }) ?? [];

  const resolvedCount = allFlags.length - flags.length;

  async function handleResolve(flagId: Id<"uncertaintyFlags">) {
    setResolving(flagId);
    try {
      await resolveFlag({ flagId, resolvedNote: "Marked as resolved" });
      toast.success("Marked as resolved");
    } catch {
      toast.error("Failed to resolve");
    } finally {
      setResolving(null);
    }
  }

  const displayFlags = showResolved ? allFlags : flags;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400 italic">
          These items were automatically detected as uncertain or manually flagged.
          {/* TODO: auto-flags are inserted by processing jobs */}
        </p>
        {resolvedCount > 0 && (
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="text-xs text-gray-400 hover:text-gray-700 ml-4 flex-shrink-0"
          >
            {showResolved ? "Hide resolved" : `Show ${resolvedCount} resolved`}
          </button>
        )}
      </div>

      {displayFlags.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm">No items need review.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayFlags.map((flag) => (
            <div
              key={flag._id}
              className={`border rounded-lg px-4 py-3 flex items-start gap-3 ${
                flag.isResolved ? "opacity-50 bg-gray-50 border-gray-200" : SEVERITY_STYLES[flag.severity]
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[flag.severity]}`}>
                    {flag.severity}
                  </span>
                  <span className="text-xs font-semibold">{KIND_LABELS[flag.kind] ?? flag.kind}</span>
                  {flag.offsetSeconds !== undefined && (
                    <span className="text-xs font-mono text-gray-500">{formatTime(flag.offsetSeconds)}</span>
                  )}
                  {flag.isResolved && (
                    <span className="text-xs text-green-600 font-medium">✓ Resolved</span>
                  )}
                </div>
                <p className="text-sm">{flag.description}</p>
                {flag.resolvedNote && (
                  <p className="text-xs mt-1 text-gray-500 italic">Note: {flag.resolvedNote}</p>
                )}
              </div>
              {!flag.isResolved && (
                <button
                  onClick={() => handleResolve(flag._id)}
                  disabled={resolving === flag._id}
                  className="flex-shrink-0 text-xs px-2.5 py-1 border border-current rounded hover:bg-white/50 transition-colors disabled:opacity-50"
                >
                  {resolving === flag._id ? "…" : "Resolve"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
