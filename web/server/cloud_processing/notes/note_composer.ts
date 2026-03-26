import type {
  ModeWindow,
  NoteSection,
  OCRResult,
  TranscriptSegment,
  UncertaintyFlag,
  VisionResult,
} from "@/lib/shared-types";
import type { StructuredVisualContext } from "../image_pipeline/types";

export interface NoteComposerInput {
  sessionId: string;
  audioChunkCount: number;
  audioUncertaintyFlags: UncertaintyFlag[];
  transcriptSegments: TranscriptSegment[];
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
  visualContexts: StructuredVisualContext[];
  modeWindows: ModeWindow[];
}

export interface NoteComposerOutput {
  noteSections: NoteSection[];
  uncertaintyFlags: UncertaintyFlag[];
}

export function composeEvidenceBackedNotes(
  input: NoteComposerInput,
): NoteComposerOutput {
  const transcriptEvidence = collectEvidence(
    input.transcriptSegments.map((segment) => segment.text),
    10,
  );
  const ocrEvidence = collectEvidence(
    input.ocrResults.map((result) => result.text),
    6,
  );
  const visionEvidence = collectEvidence(
    input.visionResults.map((result) => result.summary),
    6,
  );

  const uncertaintyFlags = dedupeUncertaintyFlags([
    ...input.transcriptSegments.flatMap((segment) => segment.uncertaintyFlags),
    ...input.ocrResults.flatMap((result) => result.uncertaintyFlags),
    ...input.visionResults.flatMap((result) => result.uncertaintyFlags),
    ...input.visualContexts.flatMap((context) => context.uncertaintyFlags),
  ]);

  const hasTranscriptEvidence = transcriptEvidence.length > 0;
  const hasVisualEvidence = ocrEvidence.length > 0 || visionEvidence.length > 0;
  const canUseImageOnlyFallback = input.audioChunkCount === 0;
  const hasAnyEvidence = hasTranscriptEvidence || (canUseImageOnlyFallback && hasVisualEvidence);

  if (!hasAnyEvidence) {
    uncertaintyFlags.push({
      kind: "note-evidence-empty",
      message: "No usable audio or image evidence was available for notes generation.",
      source: "notes",
      severity: "high",
    });
  }

  const dominantMode = input.modeWindows[0]?.mode ?? "just_talking";
  const content = hasAnyEvidence
    ? buildReadableNotesContent({
        transcriptEvidence,
        ocrEvidence,
        visionEvidence,
      })
    : buildNoNotesContent(
        deriveEmptyReason({
          audioChunkCount: input.audioChunkCount,
          audioUncertaintyFlags: input.audioUncertaintyFlags,
          transcriptSegments: input.transcriptSegments,
          visualContexts: input.visualContexts,
          ocrResults: input.ocrResults,
          visionResults: input.visionResults,
        }),
      );

  return {
    noteSections: [
      {
        id: `note_${input.sessionId}_1`,
        sessionId: input.sessionId,
        title: hasAnyEvidence ? titleForMode(dominantMode) : "No notes available",
        startMs: 0,
        endMs: input.transcriptSegments.at(-1)?.endMs ?? 0,
        content,
        transcriptSegmentIds: input.transcriptSegments.map((segment) => segment.id),
        imageIds: input.visualContexts.map((context) => context.imageId),
        ocrResultIds: input.ocrResults.map((result) => result.id),
        visionResultIds: input.visionResults.map((result) => result.id),
        mode: dominantMode,
        uncertaintyFlags,
      },
    ],
    uncertaintyFlags,
  };
}

function collectEvidence(items: string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const collected: string[] = [];

  for (const item of items) {
    const cleaned = item.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      continue;
    }

    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    collected.push(cleaned);

    if (collected.length >= maxItems) {
      break;
    }
  }

  return collected;
}

function buildReadableNotesContent(input: {
  transcriptEvidence: string[];
  ocrEvidence: string[];
  visionEvidence: string[];
}): string {
  const hasTranscript = input.transcriptEvidence.length > 0;
  const hasVisual = input.ocrEvidence.length > 0 || input.visionEvidence.length > 0;
  const keyPoints = collectEvidence(
    [...input.transcriptEvidence, ...input.ocrEvidence, ...input.visionEvidence],
    8,
  );
  const lines: string[] = [];

  lines.push("## Summary");
  lines.push(`- ${summaryLine(hasTranscript, hasVisual)}`);

  if (hasTranscript) {
    lines.push("");
    lines.push("## What was said");
    for (const item of input.transcriptEvidence) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("## Key points");
  if (keyPoints.length === 0) {
    lines.push("- No key points could be extracted from available evidence.");
  } else {
    for (const item of keyPoints) {
      lines.push(`- ${item}`);
    }
  }

  if (hasVisual) {
    lines.push("");
    lines.push("## Visual observations");
    for (const item of input.visionEvidence) {
      lines.push(`- ${item}`);
    }
    for (const item of input.ocrEvidence) {
      lines.push(`- Text seen: ${item}`);
    }
  }

  return lines.join("\n");
}

function buildNoNotesContent(reason: string): string {
  return [
    "## Summary",
    "- No notes available.",
    "",
    "## Why",
    `- ${reason}`,
  ].join("\n");
}

function summaryLine(hasTranscript: boolean, hasVisual: boolean): string {
  if (hasTranscript && hasVisual) {
    return "These notes combine spoken lecture content with useful camera observations.";
  }
  if (hasTranscript) {
    return "These notes are based on spoken lecture audio.";
  }
  return "These notes are based on camera observations and detected text.";
}

function deriveEmptyReason(input: {
  audioChunkCount: number;
  audioUncertaintyFlags: UncertaintyFlag[];
  transcriptSegments: TranscriptSegment[];
  visualContexts: StructuredVisualContext[];
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
}): string {
  const hadAudioInput = input.audioChunkCount > 0;
  const hadImageInput =
    input.visualContexts.length > 0 ||
    input.ocrResults.length > 0 ||
    input.visionResults.length > 0;

  const hadAsrFailure = input.audioUncertaintyFlags.some((flag) =>
    flag.kind.includes("transcription") ||
    flag.kind.includes("asr") ||
    flag.kind.includes("audio-artifact") ||
    flag.kind.includes("parakeet"),
  );

  if (hadAudioInput) {
    return hadAsrFailure
      ? "No transcript could be generated from audio."
      : "No words detected in audio.";
  }

  if (hadImageInput) {
    return "No readable text found in images.";
  }

  return "No usable audio or image evidence.";
}

function titleForMode(mode: ModeWindow["mode"]): string {
  if (mode === "slides") {
    return "Evidence-backed notes for slide-focused lecture";
  }
  if (mode === "handwriting") {
    return "Evidence-backed notes for handwriting/board session";
  }
  return "Evidence-backed notes for discussion session";
}

function dedupeUncertaintyFlags(flags: UncertaintyFlag[]): UncertaintyFlag[] {
  const seen = new Set<string>();
  const deduped: UncertaintyFlag[] = [];

  for (const flag of flags) {
    const key = [
      flag.kind,
      flag.severity,
      flag.source,
      flag.message,
      flag.relatedId ?? "",
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(flag);
  }

  return deduped;
}
