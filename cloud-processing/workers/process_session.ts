import type {
  AudioChunk,
  CapturedImage,
  ModeWindow,
  NoteSection,
  OCRResult,
  SpeakerSegment,
  TranscriptSegment,
  UncertaintyFlag,
  VisionResult,
} from "../../shared/types";
import { processAudioPipeline, type AudioPipelineDependencies } from "../audio_pipeline/process_audio";
import { processImagePipeline, type ImagePipelineDependencies } from "../image_pipeline/process_images";
import type { StructuredVisualContext } from "../image_pipeline/types";
import { buildNotesPipeline } from "../notes/build_notes";

export interface SessionWorkerInput {
  sessionId: string;
  audioChunks: AudioChunk[];
  capturedImages: CapturedImage[];
  existingModeWindows?: ModeWindow[];
}

export interface SessionWorkerDependencies {
  audio?: Partial<AudioPipelineDependencies>;
  image?: Partial<ImagePipelineDependencies>;
}

export interface SessionWorkerOutput {
  transcriptSegments: TranscriptSegment[];
  speakerSegments: SpeakerSegment[];
  primarySpeakerLabel?: string;
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
  visualContexts: StructuredVisualContext[];
  modeWindows: ModeWindow[];
  notes: NoteSection[];
  uncertaintyFlags: UncertaintyFlag[];
}

export async function processSessionWorker(
  input: SessionWorkerInput,
  dependencies: SessionWorkerDependencies = {},
): Promise<SessionWorkerOutput> {
  const audio = await processAudioPipeline({
    sessionId: input.sessionId,
    audioChunks: input.audioChunks,
    dependencies: dependencies.audio,
  });

  const image = await processImagePipeline({
    sessionId: input.sessionId,
    capturedImages: input.capturedImages,
    transcriptSegments: audio.transcriptSegments,
    dependencies: dependencies.image,
  });

  const notes = buildNotesPipeline({
    sessionId: input.sessionId,
    transcriptSegments: audio.transcriptSegments,
    ocrResults: image.ocrResults,
    visionResults: image.visionResults,
    visualContexts: image.visualContexts,
    existingModeWindows: input.existingModeWindows,
  });

  return {
    transcriptSegments: audio.transcriptSegments,
    speakerSegments: audio.speakerSegments,
    primarySpeakerLabel: audio.primarySpeakerLabel,
    ocrResults: image.ocrResults,
    visionResults: image.visionResults,
    visualContexts: image.visualContexts,
    modeWindows: notes.modeWindows,
    notes: notes.noteSections,
    uncertaintyFlags: dedupeUncertaintyFlags([
      ...audio.uncertaintyFlags,
      ...image.uncertaintyFlags,
      ...notes.uncertaintyFlags,
    ]),
  };
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
