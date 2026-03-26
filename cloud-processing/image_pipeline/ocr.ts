import type { OCRResult, UncertaintyFlag } from "../../shared/types";

import type { OCRAdapter, OCRInput, OCROutput } from "./types";

// TODO(ocr): Replace this placeholder with the real OCR integration while preserving
// per-image uncertainty and transcript anchoring fields.
export class PlaceholderOcrAdapter implements OCRAdapter {
  async extractText(input: OCRInput): Promise<OCROutput> {
    const results: OCRResult[] = input.images.map((image) => ({
      id: `ocr_${image.id}`,
      imageId: image.id,
      text: "",
      engine: "ocr-todo",
      blocks: [],
      nearbyTranscriptSegmentIds: image.nearbyTranscriptSegmentIds ?? [],
      uncertaintyFlags: [
        {
          kind: "ocr-not-integrated",
          message: "TODO: connect a real OCR engine at this pipeline stage.",
          source: "ocr",
          severity: "high",
          relatedId: image.id,
        },
      ],
    }));

    const uncertaintyFlags: UncertaintyFlag[] = input.images.length
      ? [
          {
            kind: "ocr-not-integrated",
            message: "OCR stage is scaffolded but not connected to a real model or service yet.",
            source: "ocr",
            severity: "high",
          },
        ]
      : [];

    return {
      results,
      uncertaintyFlags,
    };
  }
}
