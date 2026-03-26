import type {
  ClassMode,
  ModeWindow,
  TranscriptSegment,
  UncertaintyFlag,
} from "@/lib/shared-types";
import type { StructuredVisualContext } from "../image_pipeline/types";

export interface ModeDetectorInput {
  sessionId: string;
  transcriptSegments: TranscriptSegment[];
  visualContexts: StructuredVisualContext[];
}

export interface ModeDetectorOutput {
  modeWindows: ModeWindow[];
  uncertaintyFlags: UncertaintyFlag[];
}

export function detectClassModes(input: ModeDetectorInput): ModeDetectorOutput {
  const endMs = input.transcriptSegments.at(-1)?.endMs ?? 0;
  const transcriptText = input.transcriptSegments.map((segment) => segment.text.toLowerCase()).join(" ");
  const ocrText = input.visualContexts.map((context) => context.ocrText.toLowerCase()).join(" ");
  const piHints = input.visualContexts.map((context) => context.modeHint).filter(Boolean);

  const slideEvidence = countMatches(transcriptText, ["slide", "diagram", "figure", "chart"]) +
    countTextDensity(ocrText);
  const handwritingEvidence = countMatches(transcriptText, ["board", "write", "whiteboard", "draw"]) +
    piHints.filter((hint) => hint === "handwriting").length;
  const talkingEvidence =
    (input.transcriptSegments.length ? 1 : 0) +
    (input.visualContexts.length === 0 ? 2 : 0) +
    piHints.filter((hint) => hint === "just_talking").length;

  let mode: ClassMode = "just_talking";
  let rationale = "Limited visual evidence is available, so the session is treated as primarily spoken.";
  const uncertaintyFlags: UncertaintyFlag[] = [];

  if (piHints.includes("slides") || slideEvidence > handwritingEvidence && slideEvidence >= 2) {
    mode = "slides";
    rationale = "Transcript and visual evidence suggest slide-oriented content.";
  } else if (
    handwritingEvidence > slideEvidence &&
    handwritingEvidence >= 2
  ) {
    mode = "handwriting";
    rationale = "Transcript cues or Pi hints suggest whiteboard/handwriting activity.";
  } else if (talkingEvidence >= 2) {
    mode = "just_talking";
  } else {
    uncertaintyFlags.push({
      kind: "mode-detection-low-confidence",
      message:
        "Class mode evidence is weak. The cloud selected a conservative default mode.",
      source: "notes",
      severity: "medium",
    });
  }

  return {
    modeWindows: [
      {
        id: `mode_${input.sessionId}_1`,
        sessionId: input.sessionId,
        startMs: 0,
        endMs,
        mode,
        rationale,
        confidence: uncertaintyFlags.length ? 0.4 : 0.75,
        transcriptSegmentIds: input.transcriptSegments.map((segment) => segment.id),
        imageIds: input.visualContexts.map((context) => context.imageId),
        uncertaintyFlags,
      },
    ],
    uncertaintyFlags,
  };
}

function countMatches(text: string, words: string[]): number {
  let count = 0;
  for (const word of words) {
    if (text.includes(word)) {
      count += 1;
    }
  }
  return count;
}

function countTextDensity(text: string): number {
  if (!text.trim()) {
    return 0;
  }
  return text.length >= 40 ? 2 : 1;
}
