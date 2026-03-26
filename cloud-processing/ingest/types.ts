import type {
  AudioChunk,
  CapturedImage,
  Session,
  UncertaintyFlag,
} from "../../shared/types";

export type UploadKind = "audio" | "image" | "session_event";

export interface UploadThingIngestEvent {
  kind: UploadKind;
  sessionId: string;
  storageKey?: string;
  metadata: Record<string, unknown>;
  receivedAt?: string;
}

export interface AudioUploadMetadata {
  audioChunkId?: string;
  sequenceNumber?: number;
  timestamp?: string;
  durationMs?: number;
  sampleRateHz?: number;
  channels?: number;
  sessionTitle?: string;
  fileSizeBytes?: number;
}

export interface ImageUploadMetadata {
  imageId?: string;
  sequenceNumber?: number;
  timestamp?: string;
  diffScore?: number;
  blurScore?: number;
  qualityScore?: number;
  worthinessReason?: string;
  acceptedForProcessing?: boolean;
  sessionTitle?: string;
  fileSizeBytes?: number;
}

export interface SessionEventMetadata {
  eventType?: string;
  timestamp?: string;
  sessionTitle?: string;
  startedAt?: string;
  endedAt?: string;
  deviceId?: string;
  classroomLabel?: string;
  stopReason?: string;
}

export interface SessionEventRecord {
  sessionId: string;
  eventType: string;
  timestamp: string;
  metadata: SessionEventMetadata;
}

export interface IngestResult {
  sessionPatch: Partial<Session>;
  audioChunk?: AudioChunk;
  capturedImage?: CapturedImage;
  sessionEvent?: SessionEventRecord;
  enqueueWorker: boolean;
  uncertaintyFlags: UncertaintyFlag[];
}

export function nowIsoString(): string {
  return new Date().toISOString();
}

export function buildUncertaintyFlag(
  kind: string,
  message: string,
  source: UncertaintyFlag["source"],
  severity: UncertaintyFlag["severity"] = "high",
  relatedId?: string,
): UncertaintyFlag {
  return {
    kind,
    message,
    source,
    severity,
    relatedId,
  };
}

export function readString(
  value: unknown,
): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readNumber(
  value: unknown,
): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function readBoolean(
  value: unknown,
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return undefined;
}

export function fallbackTimestamp(
  event: UploadThingIngestEvent,
  flags: UncertaintyFlag[],
  kind: "audio" | "image" | "session_event",
): string {
  const source: UncertaintyFlag["source"] = kind === "audio"
    ? "audio"
    : kind === "image"
    ? "image"
    : "session";
  if (event.receivedAt) {
    flags.push(
      buildUncertaintyFlag(
        `${kind}-timestamp-fallback`,
        `Missing ${kind} capture timestamp; using ingest receive time.`,
        source,
        "medium",
      ),
    );
    return event.receivedAt;
  }

  const now = nowIsoString();
  flags.push(
    buildUncertaintyFlag(
      `${kind}-timestamp-fallback`,
      `Missing ${kind} capture timestamp; using current server time.`,
      source,
      "high",
    ),
  );
  return now;
}

export function idFromStorageKey(prefix: string, storageKey: string | undefined, sessionId: string): string {
  if (storageKey && storageKey.trim()) {
    return `${prefix}_${storageKey.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  }
  return `${prefix}_${sessionId}`;
}
