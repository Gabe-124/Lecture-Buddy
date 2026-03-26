import type {
  AudioChunk,
  SpeakerSegment,
  TranscriptSegment,
  UncertaintyFlag,
} from "../../shared/types";

export interface SpeechWindow {
  id: string;
  sessionId: string;
  chunkId: string;
  startMs: number;
  endMs: number;
  speechScore?: number;
  uncertaintyFlags: UncertaintyFlag[];
}

export interface VadInput {
  sessionId: string;
  audioChunks: AudioChunk[];
}

export interface VadOutput {
  windows: SpeechWindow[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface SilentVadFilterInput {
  sessionId: string;
  audioChunks: AudioChunk[];
  windows: SpeechWindow[];
}

export interface SilentVadFilterOutput {
  windows: SpeechWindow[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface AsrInput {
  sessionId: string;
  audioChunks: AudioChunk[];
  windows: SpeechWindow[];
}

export interface AsrOutput {
  transcriptSegments: TranscriptSegment[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface DiarizationInput {
  sessionId: string;
  audioChunks: AudioChunk[];
  windows: SpeechWindow[];
  transcriptSegments: TranscriptSegment[];
}

export interface DiarizationOutput {
  speakerSegments: SpeakerSegment[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface VadAdapter {
  detectSpeech(input: VadInput): Promise<VadOutput>;
}

export interface SilentVadFilterAdapter {
  filterSpeech(input: SilentVadFilterInput): Promise<SilentVadFilterOutput>;
}

export interface ParakeetCtcV3Adapter {
  transcribe(input: AsrInput): Promise<AsrOutput>;
}

export interface DiarizationAdapter {
  diarize(input: DiarizationInput): Promise<DiarizationOutput>;
}
