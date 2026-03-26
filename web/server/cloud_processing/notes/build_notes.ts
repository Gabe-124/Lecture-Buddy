import type {
  ModeWindow,
  NoteSection,
  OCRResult,
  TranscriptSegment,
  UncertaintyFlag,
  VisionResult,
} from "@/lib/shared-types";
import type { StructuredVisualContext } from "../image_pipeline/types";
import { detectClassModes } from "./mode_detector";
import { composeEvidenceBackedNotes } from "./note_composer";

export interface NotesPipelineInput {
  sessionId: string;
  transcriptSegments: TranscriptSegment[];
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
  visualContexts: StructuredVisualContext[];
  existingModeWindows?: ModeWindow[];
}

export interface NotesPipelineOutput {
  modeWindows: ModeWindow[];
  noteSections: NoteSection[];
  uncertaintyFlags: UncertaintyFlag[];
}

export function buildNotesPipeline(
  input: NotesPipelineInput,
): NotesPipelineOutput {
  const detectedModes = input.existingModeWindows?.length
    ? { modeWindows: input.existingModeWindows, uncertaintyFlags: [] }
    : detectClassModes({
        sessionId: input.sessionId,
        transcriptSegments: input.transcriptSegments,
        visualContexts: input.visualContexts,
      });

  const composedNotes = composeEvidenceBackedNotes({
    sessionId: input.sessionId,
    transcriptSegments: input.transcriptSegments,
    ocrResults: input.ocrResults,
    visionResults: input.visionResults,
    visualContexts: input.visualContexts,
    modeWindows: detectedModes.modeWindows,
  });

  return {
    modeWindows: detectedModes.modeWindows,
    noteSections: composedNotes.noteSections,
    uncertaintyFlags: [
      ...detectedModes.uncertaintyFlags,
      ...composedNotes.uncertaintyFlags,
    ],
  };
}
