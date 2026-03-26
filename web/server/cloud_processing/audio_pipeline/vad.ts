import type { UncertaintyFlag } from "@/lib/shared-types";

import type {
  SilentVadFilterAdapter,
  SilentVadFilterInput,
  SilentVadFilterOutput,
  SpeechWindow,
  VadAdapter,
  VadInput,
  VadOutput,
} from "./types";

export class PlaceholderVadAdapter implements VadAdapter {
  async detectSpeech(input: VadInput): Promise<VadOutput> {
    const uncertaintyFlags = input.audioChunks.length
      ? [
          buildVadFlag(
            "vad-placeholder-pass-through",
            "VAD adapter is not integrated yet. Using chunk spans as provisional speech windows.",
          ),
        ]
      : [];

    const windows = input.audioChunks
      .filter((chunk) => chunk.durationMs > 0)
      .map<SpeechWindow>((chunk) => ({
        id: `vad_${chunk.id}`,
        sessionId: input.sessionId,
        chunkId: chunk.id,
        startMs: 0,
        endMs: chunk.durationMs,
        uncertaintyFlags: [
          buildVadFlag(
            "vad-window-unverified",
            "Speech boundaries are unverified until the real VAD adapter is connected.",
            chunk.id,
          ),
        ],
      }));

    return {
      windows,
      uncertaintyFlags,
    };
  }
}

export class PlaceholderSilentVadFilterAdapter implements SilentVadFilterAdapter {
  async filterSpeech(input: SilentVadFilterInput): Promise<SilentVadFilterOutput> {
    return {
      windows: input.windows,
      uncertaintyFlags: input.windows.length
        ? [
            buildVadFlag(
              "silent-vad-placeholder-pass-through",
              "Silent VAD / WebRTC-style filtering is not integrated yet. No cloud-side silence pruning was applied.",
            ),
          ]
        : [],
    };
  }
}

function buildVadFlag(
  kind: string,
  message: string,
  relatedId?: string,
): UncertaintyFlag {
  return {
    kind,
    message,
    source: "audio",
    severity: "high",
    relatedId,
  };
}
