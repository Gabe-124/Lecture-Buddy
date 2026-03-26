import type { UncertaintyFlag } from "@/lib/shared-types";

import type {
  DiarizationAdapter,
  DiarizationInput,
  DiarizationOutput,
} from "./types";

// TODO(diarization): Replace this placeholder with the real diarization stage after
// Parakeet CTC V3 segmented transcription is available.
export class PlaceholderDiarizationAdapter implements DiarizationAdapter {
  async diarize(input: DiarizationInput): Promise<DiarizationOutput> {
    const uncertaintyFlags: UncertaintyFlag[] = input.windows.length
      ? [
          {
            kind: "diarization-not-integrated",
            message:
              "TODO: integrate the real diarization adapter after Parakeet CTC V3 transcription is available.",
            source: "audio",
            severity: "high",
          },
        ]
      : [];

    return {
      speakerSegments: [],
      uncertaintyFlags,
    };
  }
}
