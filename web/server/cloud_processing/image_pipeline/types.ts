import type {
  CapturedImage,
  ClassMode,
  OCRResult,
  TranscriptSegment,
  UncertaintyFlag,
  VisionResult,
} from "@/lib/shared-types";

export interface ImageWorthinessAssessment {
  imageId: string;
  shouldKeep: boolean;
  reason: string;
  uncertaintyFlags: UncertaintyFlag[];
}

export interface WorthinessRecheckOutput {
  keptImages: CapturedImage[];
  assessments: ImageWorthinessAssessment[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface OCRInput {
  sessionId: string;
  images: CapturedImage[];
}

export interface OCROutput {
  results: OCRResult[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface OCRAdapter {
  extractText(input: OCRInput): Promise<OCROutput>;
}

export interface Moondream3Input {
  sessionId: string;
  images: CapturedImage[];
  ocrResults: OCRResult[];
  transcriptSegments: TranscriptSegment[];
}

export interface Moondream3Output {
  results: VisionResult[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface Moondream3Adapter {
  understand(input: Moondream3Input): Promise<Moondream3Output>;
}

export interface StructuredVisualContext {
  id: string;
  sessionId: string;
  imageId: string;
  modeHint?: ClassMode;
  ocrText: string;
  visionSummary: string;
  transcriptCueSnippets: string[];
  evidenceRefs: {
    ocrResultId?: string;
    visionResultId?: string;
  };
  uncertaintyFlags: UncertaintyFlag[];
}
