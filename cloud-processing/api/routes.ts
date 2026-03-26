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
} from "../../shared/api";
import type { SessionWorkerInput } from "../workers/process_session";
import {
  handleUploadThingIngest,
  type UploadThingIngestEvent,
} from "../ingest/uploadthing_ingest";
import { InMemoryJobOrchestrator } from "../workers/job_orchestrator";
import { processSessionWorker } from "../workers/process_session";
import { InMemorySessionStore } from "./session_store";

const orchestrator = new InMemoryJobOrchestrator();
const sessionStore = new InMemorySessionStore(orchestrator);

export const CLOUD_API_ROUTE_HANDLERS = {
  "POST /api/v1/sessions/start": postSessionsStart,
  "POST /api/v1/uploads/audio": postUploadsAudio,
  "POST /api/v1/uploads/image": postUploadsImage,
  "POST /api/v1/sessions/end": postSessionsEnd,
  "POST /api/v1/heartbeat": postHeartbeat,
  "GET /api/v1/sessions/:id": getSessionById,
} as const;

export async function postSessionsStart(
  payload: CreateSessionRequest,
): Promise<CreateSessionResponse> {
  return {
    session: sessionStore.startSession(payload),
  };
}

export async function postUploadsAudio(
  payload: UploadAudioChunkRequest,
): Promise<UploadAudioChunkMetadataResponse> {
  return sessionStore.recordAudioUpload(payload);
}

export async function postUploadsImage(
  payload: UploadImageRequest,
): Promise<UploadImageMetadataResponse> {
  return sessionStore.recordImageUpload(payload);
}

export async function postSessionsEnd(
  payload: MarkSessionEndedRequest,
): Promise<MarkSessionEndedResponse> {
  return sessionStore.endSession(payload);
}

export async function postHeartbeat(
  payload: HeartbeatRequest,
): Promise<HeartbeatResponse> {
  return sessionStore.recordHeartbeat(payload);
}

export async function getSessionById(sessionId: string): Promise<SessionDetailView | null> {
  return sessionStore.getSessionDetail(sessionId);
}

export async function postUploadThingIngest(event: UploadThingIngestEvent) {
  return handleUploadThingIngest(event);
}

export async function postEnqueueSessionProcessing(payload: SessionWorkerInput) {
  return orchestrator.enqueueSession(payload);
}

export async function postRunProcessingJob(jobId: string) {
  return orchestrator.runJob(jobId);
}

export async function getProcessingJob(jobId: string) {
  return orchestrator.getJob(jobId) ?? null;
}

export async function postProcessSession(payload: SessionWorkerInput) {
  return processSessionWorker(payload);
}
