import type { CapturedImage, UncertaintyFlag } from "../../shared/types";

import {
  buildUncertaintyFlag,
  fallbackTimestamp,
  idFromStorageKey,
  readBoolean,
  readNumber,
  readString,
  type ImageUploadMetadata,
  type IngestResult,
  type UploadThingIngestEvent,
} from "./types";

export function handleImageUploadIngest(event: UploadThingIngestEvent): IngestResult {
  const uncertaintyFlags: UncertaintyFlag[] = [];
  const metadata = normalizeImageMetadata(event.metadata);
  const imageId =
    metadata.imageId ?? idFromStorageKey("image", event.storageKey, event.sessionId);

  if (!metadata.imageId) {
    uncertaintyFlags.push(
      buildUncertaintyFlag(
        "image-id-missing",
        "Image upload metadata did not include an image id.",
        "image",
        "medium",
        imageId,
      ),
    );
  }

  const capturedAt = metadata.timestamp ?? fallbackTimestamp(event, uncertaintyFlags, "image");
  const capturedImage: CapturedImage = {
    id: imageId,
    sessionId: event.sessionId,
    sequenceNumber: metadata.sequenceNumber ?? 0,
    capturedAt,
    storageKey: event.storageKey,
    diffScore: metadata.diffScore,
    acceptedForProcessing: metadata.acceptedForProcessing ?? true,
  };

  if (capturedImage.diffScore === undefined) {
    uncertaintyFlags.push(
      buildUncertaintyFlag(
        "image-diff-score-missing",
        "Image upload metadata did not include a diff score from the Pi.",
        "image",
        "medium",
        capturedImage.id,
      ),
    );
  }

  return {
    sessionPatch: {
      id: event.sessionId,
      status: "capturing",
    },
    capturedImage,
    enqueueWorker: capturedImage.acceptedForProcessing,
    uncertaintyFlags,
  };
}

function normalizeImageMetadata(raw: Record<string, unknown>): ImageUploadMetadata {
  return {
    imageId: readString(raw.image_id ?? raw.imageId),
    sequenceNumber: readNumber(raw.sequence_number ?? raw.sequenceNumber),
    timestamp: readString(raw.timestamp ?? raw.capturedAt),
    diffScore: readNumber(raw.diff_score ?? raw.diffScore),
    blurScore: readNumber(raw.blur_score ?? raw.blurScore),
    qualityScore: readNumber(raw.quality_score ?? raw.qualityScore),
    worthinessReason: readString(raw.worthiness_reason ?? raw.worthinessReason),
    acceptedForProcessing: readBoolean(
      raw.accepted_for_processing ?? raw.acceptedForProcessing,
    ),
    sessionTitle: readString(raw.session_title ?? raw.sessionTitle),
    fileSizeBytes: readNumber(raw.file_size_bytes ?? raw.fileSizeBytes),
  };
}
