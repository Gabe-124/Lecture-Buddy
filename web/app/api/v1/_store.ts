import type {
  CreateSessionRequest,
  CreateSessionResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  MarkSessionEndedRequest,
  MarkSessionEndedResponse,
  SessionDetailView,
  UploadAudioChunkMetadataResponse,
  UploadAudioChunkRequest,
  UploadImageMetadataResponse,
  UploadImageRequest,
} from "@/lib/api-contracts";
import type { PiControlCommand, PiControlState } from "@/lib/control-types";
import { processSessionWorker } from "@/server/cloud_processing/workers/process_session";
import { fetchMutation, fetchQuery } from "convex/nextjs";

import { getConvexServerOptions } from "@/lib/convex";
import { lectureBuddyApi } from "@/lib/convexApi";

export async function postSessionsStart(
  payload: CreateSessionRequest,
): Promise<CreateSessionResponse> {
  return await fetchMutation(
    lectureBuddyApi.startSession,
    { ...payload },
    getConvexServerOptions(),
  );
}

export async function postUploadsAudio(
  payload: UploadAudioChunkRequest,
): Promise<UploadAudioChunkMetadataResponse> {
  return await fetchMutation(
    lectureBuddyApi.recordAudioUpload,
    { ...payload },
    getConvexServerOptions(),
  );
}

export async function postUploadsImage(
  payload: UploadImageRequest,
): Promise<UploadImageMetadataResponse> {
  return await fetchMutation(
    lectureBuddyApi.recordImageUpload,
    { ...payload },
    getConvexServerOptions(),
  );
}

export async function postSessionsEnd(
  payload: MarkSessionEndedRequest,
): Promise<MarkSessionEndedResponse> {
  console.info("[sessions.end] begin", { sessionId: payload.sessionId });

  const response = await fetchMutation(
    lectureBuddyApi.endSession,
    { ...payload },
    getConvexServerOptions(),
  );

  console.info("[sessions.end] queued", {
    sessionId: payload.sessionId,
    processingJobStatus: response.session.processingJobStatus,
  });

  try {
    console.info("[sessions.end] mark running", { sessionId: payload.sessionId });
    await fetchMutation(
      lectureBuddyApi.markProcessingRunning,
      { sessionId: payload.sessionId },
      getConvexServerOptions(),
    );

    console.info("[sessions.end] load session bundle", { sessionId: payload.sessionId });
    const bundle = await getSessionById(payload.sessionId);
    if (!bundle) {
      throw new Error(`Unable to load session detail for processing: ${payload.sessionId}`);
    }

    console.info("[sessions.end] run worker", {
      sessionId: payload.sessionId,
      audioChunkCount: bundle.audioChunks.length,
      imageCount: bundle.capturedImages.length,
    });
    const result = await processSessionWorker({
      sessionId: payload.sessionId,
      audioChunks: bundle.audioChunks,
      capturedImages: bundle.capturedImages,
      existingModeWindows: bundle.modeWindows,
    });

    const firstNote = result.notes[0];
    console.info("[notes.diagnostic] worker output", {
      sessionId: payload.sessionId,
      source:
        "web/server/cloud_processing/notes/note_composer.ts:composeEvidenceBackedNotes",
      noteCount: result.notes.length,
      firstNoteTitle: firstNote?.title,
      firstNoteFirstLine: firstNote?.content.split("\n")[0]?.trim() ?? "",
      containsLegacyTemplate:
        /##\s*(summary|what was said|key points)|these notes are based on spoken lecture audio/i.test(
          firstNote?.content ?? "",
        ),
    });

    console.info("[sessions.end] apply result", { sessionId: payload.sessionId });
    const persisted = await fetchMutation(
      lectureBuddyApi.applyProcessingResult,
      {
        sessionId: payload.sessionId,
        result: result as unknown as Record<string, unknown>,
      },
      getConvexServerOptions(),
    );

    console.info("[sessions.end] completed", {
      sessionId: payload.sessionId,
      processingJobStatus: persisted.session.processingJobStatus,
    });

    return {
      ...response,
      session: persisted.session,
    };
  } catch (error) {
    const rootCauseMessage =
      error instanceof Error
        ? error.message
        : "Session processing failed before producing output.";

    console.error("[sessions.end] processing path failed", {
      sessionId: payload.sessionId,
      error: rootCauseMessage,
    });

    try {
      const failed = await fetchMutation(
        lectureBuddyApi.markProcessingFailed,
        { sessionId: payload.sessionId, error: rootCauseMessage },
        getConvexServerOptions(),
      );

      console.info("[sessions.end] marked failed", {
        sessionId: payload.sessionId,
        processingJobStatus: failed.session.processingJobStatus,
      });

      return {
        ...response,
        session: failed.session,
      };
    } catch (markFailedError) {
      const markFailedMessage =
        markFailedError instanceof Error
          ? markFailedError.message
          : "Unknown error while marking session processing failed.";

      console.error("[sessions.end] failed to mark failed", {
        sessionId: payload.sessionId,
        rootCauseError: rootCauseMessage,
        markFailedError: markFailedMessage,
      });

      throw new Error(
        [
          `Session processing path failed: ${rootCauseMessage}`,
          `Unable to persist failed status: ${markFailedMessage}`,
        ].join(" | "),
      );
    }
  }
}

export async function postReprocessSession(sessionId: string) {
  console.info("[sessions.reprocess] begin", { sessionId });

  try {
    await fetchMutation(
      lectureBuddyApi.markProcessingRunning,
      { sessionId },
      getConvexServerOptions(),
    );

    const bundle = await getSessionById(sessionId);
    if (!bundle) {
      throw new Error(`Unable to load session detail for processing: ${sessionId}`);
    }

    const result = await processSessionWorker({
      sessionId,
      audioChunks: bundle.audioChunks,
      capturedImages: bundle.capturedImages,
      existingModeWindows: bundle.modeWindows,
    });

    const firstNote = result.notes[0];
    console.info("[notes.diagnostic] worker output", {
      sessionId,
      source:
        "web/server/cloud_processing/notes/note_composer.ts:composeEvidenceBackedNotes",
      noteCount: result.notes.length,
      firstNoteTitle: firstNote?.title,
      firstNoteFirstLine: firstNote?.content.split("\n")[0]?.trim() ?? "",
      containsLegacyTemplate:
        /##\s*(summary|what was said|key points)|these notes are based on spoken lecture audio/i.test(
          firstNote?.content ?? "",
        ),
    });

    const persisted = await fetchMutation(
      lectureBuddyApi.applyProcessingResult,
      {
        sessionId,
        result: result as unknown as Record<string, unknown>,
      },
      getConvexServerOptions(),
    );

    console.info("[sessions.reprocess] completed", {
      sessionId,
      processingJobStatus: persisted.session.processingJobStatus,
    });

    return {
      session: persisted.session,
    };
  } catch (error) {
    const rootCauseMessage =
      error instanceof Error
        ? error.message
        : "Session reprocessing failed before producing output.";

    await fetchMutation(
      lectureBuddyApi.markProcessingFailed,
      { sessionId, error: rootCauseMessage },
      getConvexServerOptions(),
    );

    throw new Error(`Session reprocessing failed: ${rootCauseMessage}`);
  }
}

export async function postHeartbeat(
  payload: HeartbeatRequest,
): Promise<HeartbeatResponse> {
  return await fetchMutation(
    lectureBuddyApi.recordHeartbeat,
    { ...payload },
    getConvexServerOptions(),
  );
}

export async function getSessionById(sessionId: string): Promise<SessionDetailView | null> {
  return await fetchQuery(
    lectureBuddyApi.getSessionById,
    { sessionId },
    getConvexServerOptions(),
  );
}

export async function pollNextPiControlCommand(payload: {
  deviceId: string;
  runtimeStatus?: string;
  activeSessionId?: string;
  deviceIpAddress?: string;
}): Promise<{ command: PiControlCommand | null }> {
  return await fetchMutation(
    lectureBuddyApi.pollNextPiControlCommand,
    { ...payload },
    getConvexServerOptions(),
  );
}

export async function acknowledgePiControlCommand(payload: {
  commandId: string;
  status: "applied" | "failed";
  errorMessage?: string;
}): Promise<PiControlCommand> {
  return await fetchMutation(
    lectureBuddyApi.acknowledgePiControlCommand,
    { ...payload },
    getConvexServerOptions(),
  );
}

export async function enqueuePiControlCommand(payload: {
  deviceId: string;
  commandType: "start_session" | "stop_session" | "restart_service";
  requestedBy: string;
  reason?: string;
}): Promise<PiControlCommand> {
  return await fetchMutation(
    lectureBuddyApi.enqueuePiControlCommand,
    { ...payload },
    getConvexServerOptions(),
  );
}

export async function getPiControlState(deviceId: string): Promise<PiControlState> {
  return await fetchQuery(
    lectureBuddyApi.getPiControlState,
    { deviceId },
    getConvexServerOptions(),
  );
}
