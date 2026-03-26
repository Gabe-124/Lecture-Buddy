import type {
  CapturedImage,
  OCRResult,
  TranscriptSegment,
  UncertaintyFlag,
  UncertaintySeverity,
  VisionResult,
} from "../../shared/types";

import { PlaceholderMoondream3Adapter } from "./moondream3";
import { PlaceholderOcrAdapter } from "./ocr";
import type {
  Moondream3Adapter,
  OCRAdapter,
  StructuredVisualContext,
} from "./types";
import { recheckImageWorthiness } from "./worthiness_recheck";

export interface ImagePipelineDependencies {
  ocrAdapter: OCRAdapter;
  moondream3Adapter: Moondream3Adapter;
}

export interface ImagePipelineInput {
  sessionId: string;
  capturedImages: CapturedImage[];
  transcriptSegments: TranscriptSegment[];
  dependencies?: Partial<ImagePipelineDependencies>;
}

export interface ImagePipelineOutput {
  keptImages: CapturedImage[];
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
  visualContexts: StructuredVisualContext[];
  uncertaintyFlags: UncertaintyFlag[];
}

export function createDefaultImagePipelineDependencies(): ImagePipelineDependencies {
  return {
    ocrAdapter: new PlaceholderOcrAdapter(),
    moondream3Adapter: new PlaceholderMoondream3Adapter(),
  };
}

export async function processImagePipeline(
  input: ImagePipelineInput,
): Promise<ImagePipelineOutput> {
  const dependencies = {
    ...createDefaultImagePipelineDependencies(),
    ...input.dependencies,
  };

  const worthiness = recheckImageWorthiness(input.capturedImages);
  const ocr = await dependencies.ocrAdapter.extractText({
    sessionId: input.sessionId,
    images: worthiness.keptImages,
  });
  const moondream = await dependencies.moondream3Adapter.understand({
    sessionId: input.sessionId,
    images: worthiness.keptImages,
    ocrResults: ocr.results,
    transcriptSegments: input.transcriptSegments,
  });
  const visualContexts = buildStructuredVisualContexts({
    sessionId: input.sessionId,
    images: worthiness.keptImages,
    ocrResults: ocr.results,
    visionResults: moondream.results,
    transcriptSegments: input.transcriptSegments,
  });

  return {
    keptImages: worthiness.keptImages,
    ocrResults: ocr.results,
    visionResults: moondream.results,
    visualContexts,
    uncertaintyFlags: [
      ...worthiness.uncertaintyFlags,
      ...ocr.uncertaintyFlags,
      ...moondream.uncertaintyFlags,
      ...visualContexts.flatMap((context) => context.uncertaintyFlags),
    ],
  };
}

function buildStructuredVisualContexts(input: {
  sessionId: string;
  images: CapturedImage[];
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
  transcriptSegments: TranscriptSegment[];
}): StructuredVisualContext[] {
  return input.images.map((image) => {
    const ocrResult = input.ocrResults.find((result) => result.imageId === image.id);
    const visionResult = input.visionResults.find((result) => result.imageId === image.id);
    const transcriptCueSnippets = findTranscriptCueSnippets(input.transcriptSegments);

    return {
      id: `visual_context_${image.id}`,
      sessionId: input.sessionId,
      imageId: image.id,
      modeHint: image.modeHint,
      ocrText: ocrResult?.text ?? "",
      visionSummary: visionResult?.summary ?? "",
      transcriptCueSnippets,
      evidenceRefs: {
        ocrResultId: ocrResult?.id,
        visionResultId: visionResult?.id,
      },
      uncertaintyFlags: [
        ...(ocrResult?.uncertaintyFlags ?? []),
        ...(visionResult?.uncertaintyFlags ?? []),
        ...(transcriptCueSnippets.length
          ? []
          : [
              buildVisionUncertaintyFlag(
                "transcript-guidance-missing",
                "No transcript cue snippets were available to guide image interpretation for this image.",
                "medium",
                image.id,
              ),
            ]),
      ],
    };
  });
}

function findTranscriptCueSnippets(
  transcriptSegments: TranscriptSegment[],
): string[] {
  const cueWords = ["see", "diagram", "board", "slide", "write", "figure"];
  return transcriptSegments
    .filter((segment) =>
      cueWords.some((word) => segment.text.toLowerCase().includes(word))
    )
    .slice(0, 4)
    .map((segment) => segment.text);
}

function buildVisionUncertaintyFlag(
  kind: string,
  message: string,
  severity: UncertaintySeverity,
  relatedId?: string,
): UncertaintyFlag {
  return {
    kind,
    message,
    source: "vision",
    severity,
    relatedId,
  };
}
