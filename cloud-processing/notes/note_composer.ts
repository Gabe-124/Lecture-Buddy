import type {
  ModeWindow,
  NoteSection,
  OCRResult,
  TranscriptSegment,
  UncertaintyFlag,
  VisionResult,
} from "../../shared/types";
import type { StructuredVisualContext } from "../image_pipeline/types";

export interface NoteComposerInput {
  sessionId: string;
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
  const transcriptEvidence = input.transcriptSegments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .slice(0, 8);
  const ocrEvidence = input.ocrResults
    .map((result) => result.text.trim())
    .filter(Boolean)
    .slice(0, 5);
  const visionEvidence = input.visionResults
    .map((result) => result.summary.trim())
    .filter(Boolean)
    .slice(0, 5);

  const uncertaintyFlags = dedupeUncertaintyFlags([
    ...input.transcriptSegments.flatMap((segment) => segment.uncertaintyFlags),
    ...input.ocrResults.flatMap((result) => result.uncertaintyFlags),
    ...input.visionResults.flatMap((result) => result.uncertaintyFlags),
    ...input.visualContexts.flatMap((context) => context.uncertaintyFlags),
  ]);

  if (
    transcriptEvidence.length === 0 &&
    ocrEvidence.length === 0 &&
    visionEvidence.length === 0
  ) {
    uncertaintyFlags.push({
      kind: "note-evidence-empty",
      message:
        "The notes pipeline had no grounded transcript, OCR, or vision content to merge.",
      source: "notes",
      severity: "high",
    });
  }

  const dominantMode = input.modeWindows[0]?.mode ?? "just_talking";
  const content = [
    `Mode: ${dominantMode}`,
    "Grounding policy: this starter note composer only surfaces evidence already present in transcript, OCR, and vision outputs.",
    buildEvidenceBlock("Transcript evidence", transcriptEvidence, "No transcript evidence available yet."),
    buildEvidenceBlock("OCR evidence", ocrEvidence, "No OCR evidence available yet."),
    buildEvidenceBlock("Vision evidence", visionEvidence, "No Moondream 3 evidence available yet."),
    buildUncertaintyBlock(uncertaintyFlags),
  ].join("\n\n");

  return {
    noteSections: [
      {
        id: `note_${input.sessionId}_1`,
        sessionId: input.sessionId,
        title: titleForMode(dominantMode),
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

function buildEvidenceBlock(
  title: string,
  items: string[],
  emptyMessage: string,
): string {
  if (!items.length) {
    return `${title}:\n- ${emptyMessage}`;
  }

  return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function buildUncertaintyBlock(flags: UncertaintyFlag[]): string {
  if (!flags.length) {
    return "Uncertainty:\n- No additional uncertainty flags were emitted by the current scaffolding.";
  }

  const uniqueMessages = Array.from(new Set(flags.map((flag) => `${flag.severity}: ${flag.message}`)));
  return `Uncertainty:\n${uniqueMessages.map((message) => `- ${message}`).join("\n")}`;
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
