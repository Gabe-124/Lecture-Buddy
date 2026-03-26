import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";

type Segment = {
  _id: Id<"transcriptSegments">;
  _creationTime: number;
  sessionId: Id<"sessions">;
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  text: string;
  speakerId?: string;
  confidence?: number;
  language?: string;
  audioChunkId?: Id<"audioChunks">;
};

interface Props {
  sessionId: Id<"sessions">;
}

export function TranscriptPanel({ sessionId }: Props) {
  const segments = useQuery(api.transcript.listBySession, { sessionId }) ?? [];
  const flagItem = useMutation(api.uncertainty.flag);
  const [flagging, setFlagging] = useState<Id<"transcriptSegments"> | null>(null);

  if (segments.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-3xl mb-2">🎙️</div>
        <p className="text-sm">No transcript yet.</p>
        <p className="text-xs mt-1">
          {/* TODO: show transcription job status */}
          Transcript will appear here once audio is processed.
        </p>
      </div>
    );
  }

  // Group by speaker runs
  const grouped = groupBySpeaker(segments);

  async function handleFlag(seg: typeof segments[0]) {
    setFlagging(seg._id);
    try {
      await flagItem({
        sessionId,
        kind: "user_flagged",
        description: `Manually flagged at ${formatTime(seg.startOffsetSeconds)}`,
        offsetSeconds: seg.startOffsetSeconds,
        relatedTranscriptId: seg._id,
      });
      toast.success("Flagged for review");
    } catch {
      toast.error("Failed to flag");
    } finally {
      setFlagging(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 italic">
        Auto-transcribed — low confidence segments are highlighted.
        {/* TODO: show ASR model name and language */}
      </p>
      {grouped.map((group, gi) => (
        <div key={gi} className="flex gap-3">
          <div className="w-16 flex-shrink-0 text-right">
            <span className="text-xs font-mono text-gray-400 mt-1 block">
              {formatTime(group[0].startOffsetSeconds)}
            </span>
            <span className="text-xs text-indigo-400 font-medium block mt-0.5">
              {group[0].speakerId ? speakerLabel(group[0].speakerId) : "?"}
            </span>
          </div>
          <div className="flex-1 space-y-1">
            {group.map((seg) => (
              <div
                key={seg._id}
                className={`group relative text-sm rounded px-2 py-1 ${
                  seg.confidence !== undefined && seg.confidence < 0.6
                    ? "bg-amber-50 border border-amber-200 text-amber-900"
                    : "text-gray-800 hover:bg-gray-50"
                }`}
              >
                <span>{seg.text}</span>
                {seg.confidence !== undefined && seg.confidence < 0.6 && (
                  <span className="ml-2 text-xs text-amber-500 font-mono">
                    ({Math.round(seg.confidence * 100)}%)
                  </span>
                )}
                <button
                  onClick={() => handleFlag(seg)}
                  disabled={flagging === seg._id}
                  className="absolute right-2 top-1 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-amber-600 transition-opacity"
                  title="Flag for review"
                >
                  ⚑
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupBySpeaker(segments: Segment[]) {
  const groups: (typeof segments)[] = [];
  let current: typeof segments = [];
  let lastSpeaker: string | undefined = undefined;

  for (const seg of segments) {
    if (seg.speakerId !== lastSpeaker && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(seg);
    lastSpeaker = seg.speakerId;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function speakerLabel(id: string) {
  const n = id.replace("SPEAKER_", "");
  const labels = ["Prof", "Stu A", "Stu B", "Stu C"];
  const idx = parseInt(n, 10);
  return labels[idx] ?? `S${n}`;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
