import type { UncertaintyFlag, VisionResult } from "@/lib/shared-types";

import type {
  Moondream3Adapter,
  Moondream3Input,
  Moondream3Output,
} from "./types";

// TODO(moondream-3): Replace this placeholder with the real Moondream 3 image
// understanding stage and keep transcript-guided evidence references intact.
export class PlaceholderMoondream3Adapter implements Moondream3Adapter {
  async understand(input: Moondream3Input): Promise<Moondream3Output> {
    const results: VisionResult[] = input.images.map((image) => ({
      id: `vision_${image.id}`,
      imageId: image.id,
      model: "moondream-3",
      summary: "",
      extractedTextCues: [],
      supportingOcrBlockIds: [],
      sceneType: image.modeHint,
      nearbyTranscriptSegmentIds: image.nearbyTranscriptSegmentIds ?? [],
      uncertaintyFlags: [
        {
          kind: "moondream-3-not-integrated",
          message: "TODO: connect the real Moondream 3 image understanding adapter here.",
          source: "vision",
          severity: "high",
          relatedId: image.id,
        },
      ],
    }));

    const uncertaintyFlags: UncertaintyFlag[] = input.images.length
      ? [
          {
            kind: "moondream-3-not-integrated",
            message:
              "Moondream 3 stage is scaffolded but not connected to a real model invocation yet.",
            source: "vision",
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
