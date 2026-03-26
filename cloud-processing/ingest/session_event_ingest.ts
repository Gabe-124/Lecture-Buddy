import type { SessionStatus, UncertaintyFlag } from "../../shared/types";

import {
  buildUncertaintyFlag,
  fallbackTimestamp,
  readString,
  type IngestResult,
  type SessionEventMetadata,
  type UploadThingIngestEvent,
} from "./types";

export function handleSessionEventIngest(event: UploadThingIngestEvent): IngestResult {
  const uncertaintyFlags: UncertaintyFlag[] = [];
  const metadata = normalizeSessionEventMetadata(event.metadata);
  const timestamp = metadata.timestamp ?? fallbackTimestamp(event, uncertaintyFlags, "session_event");
  const eventType = metadata.eventType ?? "session_event";

  return {
    sessionPatch: {
      id: event.sessionId,
      status: statusFromEventType(eventType),
      title: metadata.sessionTitle,
      startedAt: metadata.startedAt ?? timestamp,
      endedAt: metadata.endedAt,
      deviceId: metadata.deviceId,
      classroomLabel: metadata.classroomLabel,
    },
    sessionEvent: {
      sessionId: event.sessionId,
      eventType,
      timestamp,
      metadata,
    },
    enqueueWorker: false,
    uncertaintyFlags: metadata.eventType
      ? uncertaintyFlags
      : [
          ...uncertaintyFlags,
          buildUncertaintyFlag(
            "session-event-type-missing",
            "Session event upload metadata did not include an event type.",
            "session",
            "medium",
          ),
        ],
  };
}

function normalizeSessionEventMetadata(raw: Record<string, unknown>): SessionEventMetadata {
  return {
    eventType: readString(raw.event_type ?? raw.eventType),
    timestamp: readString(raw.timestamp),
    sessionTitle: readString(raw.session_title ?? raw.sessionTitle),
    startedAt: readString(raw.started_at ?? raw.startedAt),
    endedAt: readString(raw.ended_at ?? raw.endedAt),
    deviceId: readString(raw.device_id ?? raw.deviceId),
    classroomLabel: readString(raw.classroom_label ?? raw.classroomLabel),
    stopReason: readString(raw.stop_reason ?? raw.stopReason),
  };
}

function statusFromEventType(eventType: string): SessionStatus {
  if (eventType === "session_started") {
    return "capturing";
  }
  if (eventType === "session_stopped") {
    return "uploading";
  }
  return "capturing";
}
