import type { AudioChunk, UncertaintyFlag } from "../../shared/types";

import {
  buildUncertaintyFlag,
  fallbackTimestamp,
  idFromStorageKey,
  readNumber,
  readString,
  type AudioUploadMetadata,
  type IngestResult,
  type UploadThingIngestEvent,
} from "./types";

export function handleAudioUploadIngest(event: UploadThingIngestEvent): IngestResult {
  const uncertaintyFlags: UncertaintyFlag[] = [];
  const metadata = normalizeAudioMetadata(event.metadata);
  const audioChunkId =
    metadata.audioChunkId ?? idFromStorageKey("audio", event.storageKey, event.sessionId);

  if (!metadata.audioChunkId) {
    uncertaintyFlags.push(
      buildUncertaintyFlag(
        "audio-chunk-id-missing",
        "Audio upload metadata did not include an audio chunk id.",
        "audio",
        "medium",
        audioChunkId,
      ),
    );
  }

  const capturedAt = metadata.timestamp ?? fallbackTimestamp(event, uncertaintyFlags, "audio");
  const audioChunk: AudioChunk = {
    id: audioChunkId,
    sessionId: event.sessionId,
    sequenceNumber: metadata.sequenceNumber ?? 0,
    capturedAt,
    durationMs: metadata.durationMs ?? 0,
    sampleRateHz: metadata.sampleRateHz ?? 16000,
    channels: metadata.channels ?? 1,
    storageKey: event.storageKey,
    uploadStatus: "uploaded",
  };

  if (audioChunk.durationMs <= 0) {
    uncertaintyFlags.push(
      buildUncertaintyFlag(
        "audio-duration-missing",
        "Audio duration was missing or invalid in upload metadata.",
        "audio",
        "high",
        audioChunk.id,
      ),
    );
  }

  return {
    sessionPatch: {
      id: event.sessionId,
      status: "capturing",
    },
    audioChunk,
    enqueueWorker: true,
    uncertaintyFlags,
  };
}

function normalizeAudioMetadata(raw: Record<string, unknown>): AudioUploadMetadata {
  return {
    audioChunkId: readString(raw.audio_chunk_id ?? raw.chunkId),
    sequenceNumber: readNumber(raw.sequence_number ?? raw.sequenceNumber),
    timestamp: readString(raw.timestamp ?? raw.capturedAt),
    durationMs: readNumber(raw.duration_ms ?? raw.durationMs),
    sampleRateHz: readNumber(raw.sample_rate_hz ?? raw.sampleRateHz),
    channels: readNumber(raw.channels),
    sessionTitle: readString(raw.session_title ?? raw.sessionTitle),
    fileSizeBytes: readNumber(raw.file_size_bytes ?? raw.fileSizeBytes),
  };
}
