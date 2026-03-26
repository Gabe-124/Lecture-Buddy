import type {
  SpeakerSegment,
  TranscriptSegment,
  UncertaintyFlag,
} from "../../shared/types";

import { PlaceholderDiarizationAdapter } from "./diarization";
import { HttpParakeetCtcV3Adapter } from "./parakeet_ctc_v3";
import { applyPrimaryLectureSpeakerFilter } from "./primary_speaker_filter";
import type {
  DiarizationAdapter,
  ParakeetCtcV3Adapter,
  SilentVadFilterAdapter,
  SpeechWindow,
  VadAdapter,
} from "./types";
import { PlaceholderSilentVadFilterAdapter, PlaceholderVadAdapter } from "./vad";

import type { AudioChunk } from "../../shared/types";

export interface AudioPipelineDependencies {
  vadAdapter: VadAdapter;
  silentVadFilterAdapter: SilentVadFilterAdapter;
  parakeetCtcV3Adapter: ParakeetCtcV3Adapter;
  diarizationAdapter: DiarizationAdapter;
}

export interface AudioPipelineInput {
  sessionId: string;
  audioChunks: AudioChunk[];
  dependencies?: Partial<AudioPipelineDependencies>;
}

export interface AudioPipelineOutput {
  speechWindows: SpeechWindow[];
  filteredSpeechWindows: SpeechWindow[];
  transcriptSegments: TranscriptSegment[];
  speakerSegments: SpeakerSegment[];
  primarySpeakerLabel?: string;
  uncertaintyFlags: UncertaintyFlag[];
}

export function createDefaultAudioPipelineDependencies(): AudioPipelineDependencies {
  return {
    vadAdapter: new PlaceholderVadAdapter(),
    silentVadFilterAdapter: new PlaceholderSilentVadFilterAdapter(),
    parakeetCtcV3Adapter: new HttpParakeetCtcV3Adapter(),
    diarizationAdapter: new PlaceholderDiarizationAdapter(),
  };
}

export async function processAudioPipeline(
  input: AudioPipelineInput,
): Promise<AudioPipelineOutput> {
  const dependencies = {
    ...createDefaultAudioPipelineDependencies(),
    ...input.dependencies,
  };

  if (!input.audioChunks.length) {
    return {
      speechWindows: [],
      filteredSpeechWindows: [],
      transcriptSegments: [],
      speakerSegments: [],
      uncertaintyFlags: [
        {
          kind: "audio-input-empty",
          message: "No uploaded audio chunks were provided to the cloud audio pipeline.",
          source: "audio",
          severity: "medium",
        },
      ],
    };
  }

  const vad = await dependencies.vadAdapter.detectSpeech({
    sessionId: input.sessionId,
    audioChunks: input.audioChunks,
  });
  const silentVad = await dependencies.silentVadFilterAdapter.filterSpeech({
    sessionId: input.sessionId,
    audioChunks: input.audioChunks,
    windows: vad.windows,
  });
  const asr = await dependencies.parakeetCtcV3Adapter.transcribe({
    sessionId: input.sessionId,
    audioChunks: input.audioChunks,
    windows: silentVad.windows,
  });
  const diarization = await dependencies.diarizationAdapter.diarize({
    sessionId: input.sessionId,
    audioChunks: input.audioChunks,
    windows: silentVad.windows,
    transcriptSegments: asr.transcriptSegments,
  });
  const filteredSpeakers = applyPrimaryLectureSpeakerFilter({
    transcriptSegments: asr.transcriptSegments,
    speakerSegments: diarization.speakerSegments,
  });

  return {
    speechWindows: vad.windows,
    filteredSpeechWindows: silentVad.windows,
    transcriptSegments: filteredSpeakers.transcriptSegments,
    speakerSegments: filteredSpeakers.speakerSegments,
    primarySpeakerLabel: filteredSpeakers.primarySpeakerLabel,
    uncertaintyFlags: [
      ...vad.uncertaintyFlags,
      ...silentVad.uncertaintyFlags,
      ...asr.uncertaintyFlags,
      ...diarization.uncertaintyFlags,
      ...filteredSpeakers.uncertaintyFlags,
      ...filteredSpeakers.transcriptSegments.flatMap((segment) => segment.uncertaintyFlags),
    ],
  };
}
