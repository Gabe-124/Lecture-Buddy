import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  sessionId: Id<"sessions">;
}

export function NotesPanel({ sessionId }: Props) {
  const notes = useQuery(api.notes.listBySession, { sessionId }) ?? [];

  if (notes.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-3xl mb-2">📝</div>
        <p className="text-sm">No notes yet.</p>
        <p className="text-xs mt-1 text-gray-400">
          {/* TODO: trigger note_generation job */}
          Notes will appear here once the session is processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 italic">
        AI-generated notes — always verify against the transcript.
        {/* TODO: show last-generated timestamp */}
      </p>
      {notes.map((note) => (
        <NoteSection key={note._id} note={note} />
      ))}
    </div>
  );
}

function NoteSection({
  note,
}: {
  note: {
    _id: Id<"noteSections">;
    heading: string;
    body: string;
    isUserEdited: boolean;
    startOffsetSeconds?: number;
  };
}) {
  const updateNote = useMutation(api.notes.update);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateNote({ noteSectionId: note._id, body: draft });
      setEditing(false);
      toast.success("Note saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 text-sm">{note.heading}</h3>
        <div className="flex items-center gap-2">
          {note.startOffsetSeconds !== undefined && (
            <span className="text-xs text-gray-400 font-mono">{formatTime(note.startOffsetSeconds)}</span>
          )}
          {note.isUserEdited && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">edited</span>
          )}
          <button
            onClick={() => { setEditing(!editing); setDraft(note.body); }}
            className="text-xs text-indigo-500 hover:text-indigo-700"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>
      <div className="px-4 py-3">
        {editing ? (
          <div>
            <textarea
              className="w-full text-sm font-mono border border-gray-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y min-h-[120px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <NoteBody body={note.body} />
        )}
      </div>
    </div>
  );
}

// Minimal markdown-ish renderer (no external lib)
function NoteBody({ body }: { body: string }) {
  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (inCode) {
        elements.push(
          <pre key={i} className="bg-gray-900 text-green-300 text-xs rounded p-3 overflow-x-auto my-2 font-mono">
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    if (line.startsWith("- ")) {
      elements.push(
        <li key={i} className="text-sm text-gray-700 ml-4 list-disc">
          <InlineMarkdown text={line.slice(2)} />
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-gray-700">
          <InlineMarkdown text={line} />
        </p>
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
