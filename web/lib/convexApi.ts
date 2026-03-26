import type { SessionDetailView } from "@/lib/api-contracts";
import type {
  CreateSessionResponse,
  CreateSessionRequest,
  HeartbeatResponse,
  HeartbeatRequest,
  MarkSessionEndedResponse,
  MarkSessionEndedRequest,
  UploadAudioChunkRequest,
  UploadAudioChunkMetadataResponse,
  UploadImageRequest,
  UploadImageMetadataResponse,
} from "@/lib/api-contracts";
import type { Session } from "@/lib/shared-types";
import { makeFunctionReference } from "convex/server";

type ConvexArgs<T> = T & Record<string, unknown>;

export const lectureBuddyApi = {
  listSessions: makeFunctionReference<"query", Record<string, never>, Session[]>(
    "lectureBuddy:listSessions",
  ),
  getSessionById: makeFunctionReference<
    "query",
    { sessionId: string },
    SessionDetailView | null
  >("lectureBuddy:getSessionById"),
  startSession: makeFunctionReference<
    "mutation",
    ConvexArgs<CreateSessionRequest>,
    CreateSessionResponse
  >("lectureBuddy:startSession"),
  recordAudioUpload: makeFunctionReference<
    "mutation",
    ConvexArgs<UploadAudioChunkRequest>,
    UploadAudioChunkMetadataResponse
  >("lectureBuddy:recordAudioUpload"),
  recordImageUpload: makeFunctionReference<
    "mutation",
    ConvexArgs<UploadImageRequest>,
    UploadImageMetadataResponse
  >("lectureBuddy:recordImageUpload"),
  recordHeartbeat: makeFunctionReference<
    "mutation",
    ConvexArgs<HeartbeatRequest>,
    HeartbeatResponse
  >("lectureBuddy:recordHeartbeat"),
  endSession: makeFunctionReference<
    "mutation",
    ConvexArgs<MarkSessionEndedRequest>,
    MarkSessionEndedResponse
  >("lectureBuddy:endSession"),
  markProcessingRunning: makeFunctionReference<
    "mutation",
    { sessionId: string },
    { session: Session }
  >("lectureBuddy:markProcessingRunning"),
  markProcessingFailed: makeFunctionReference<
    "mutation",
    { sessionId: string; error: string },
    { session: Session }
  >("lectureBuddy:markProcessingFailed"),
  applyProcessingResult: makeFunctionReference<
    "mutation",
    { sessionId: string; result: Record<string, unknown> },
    { session: Session }
  >("lectureBuddy:applyProcessingResult"),
};
