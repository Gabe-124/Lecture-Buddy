import { handleAudioUploadIngest } from "./audio_ingest";
import { handleImageUploadIngest } from "./image_ingest";
import { handleSessionEventIngest } from "./session_event_ingest";

export type {
  IngestResult,
  SessionEventRecord,
  UploadThingIngestEvent,
} from "./types";

import type { IngestResult, UploadThingIngestEvent } from "./types";

export function handleUploadThingIngest(event: UploadThingIngestEvent): IngestResult {
  if (event.kind === "audio") {
    return handleAudioUploadIngest(event);
  }
  if (event.kind === "image") {
    return handleImageUploadIngest(event);
  }
  return handleSessionEventIngest(event);
}
