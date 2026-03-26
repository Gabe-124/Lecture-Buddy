import type {
  AudioChunk,
  CapturedImage,
  FinalNotes,
  ModeWindow,
  OCRResult,
  ProcessingJobStatus,
  Session,
  SessionStatus,
  SpeakerSegment,
  Timestamp,
  TranscriptSegment,
  UncertaintyFlag,
  UploadReceipt,
  VisionResult,
} from "./types";

export const CLOUD_API_ROUTES = {
  sessionStart: "/api/v1/sessions/start",
  uploadAudio: "/api/v1/uploads/audio",
  uploadImage: "/api/v1/uploads/image",
  sessionEnd: "/api/v1/sessions/end",
  heartbeat: "/api/v1/heartbeat",
  sessionDetail: "/api/v1/sessions/:id",
} as const;

export interface UploadArtifactRef {
  storageKey?: string;
  contentType?: string;
  originalFileName?: string;
  fileSizeBytes?: number;
}

export interface CreateSessionRequest {
  title: string;
  deviceId: string;
  startedAt: Timestamp;
  classroomLabel?: string;
  clientSessionId?: string;
  deviceIpAddress?: string;
}

export interface CreateSessionResponse {
  session: Session;
}

export interface UploadAudioChunkMetadataRequest {
  sessionId: string;
  audioChunk: AudioChunk;
}

export interface UploadAudioChunkRequest extends UploadAudioChunkMetadataRequest {
  artifact?: UploadArtifactRef;
}

export interface UploadAudioChunkMetadataResponse {
  audioChunk: AudioChunk;
  receipt: UploadReceipt;
}

export interface UploadImageMetadataRequest {
  sessionId: string;
  capturedImage: CapturedImage;
}

export interface UploadImageRequest extends UploadImageMetadataRequest {
  artifact?: UploadArtifactRef;
}

export interface UploadImageMetadataResponse {
  capturedImage: CapturedImage;
  receipt: UploadReceipt;
}

export interface MarkSessionEndedRequest {
  sessionId: string;
  endedAt: Timestamp;
  stopReason?: string;
  lastAudioSequenceNumber?: number;
  lastImageSequenceNumber?: number;
}

export interface MarkSessionEndedResponse {
  session: Session;
  receipt: UploadReceipt;
}

export interface HeartbeatRequest {
  sessionId: string;
  observedAt: Timestamp;
  queuedUploadCount?: number;
  lastAudioSequenceNumber?: number;
  lastImageSequenceNumber?: number;
  runtimeStatus?: string;
  deviceIpAddress?: string;
}

export interface HeartbeatResponse {
  sessionId: string;
  receivedAt: Timestamp;
  status: SessionStatus;
}

export interface RequestProcessingRequest {
  sessionId: string;
  requestedAt: Timestamp;
  forceReprocess?: boolean;
  reason?: string;
}

export interface RequestProcessingResponse {
  sessionId: string;
  jobId: string;
  status: ProcessingJobStatus;
  queuedAt: Timestamp;
}

export interface FetchSessionResultsRequest {
  sessionId: string;
  includeTranscript?: boolean;
  includeVisualArtifacts?: boolean;
  includeFinalNotes?: boolean;
}

export interface FetchSessionResultsResponse {
  session: Session;
  audioChunks: AudioChunk[];
  transcriptSegments: TranscriptSegment[];
  speakerSegments: SpeakerSegment[];
  capturedImages: CapturedImage[];
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
  modeWindows: ModeWindow[];
  finalNotes?: FinalNotes;
  processingJobStatus?: ProcessingJobStatus;
  uploadReceipts: UploadReceipt[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface SessionDetailView
  extends Omit<FetchSessionResultsResponse, "finalNotes" | "processingJobStatus"> {
  finalNotes: FinalNotes | null;
  processingJobStatus: ProcessingJobStatus | null;
}

export function buildSessionDetailView(
  response: FetchSessionResultsResponse,
): SessionDetailView {
  return {
    ...response,
    finalNotes: response.finalNotes ?? null,
    processingJobStatus: response.processingJobStatus ?? null,
  };
}

export function buildCloudApiUrl(
  baseUrl: string,
  route: keyof typeof CLOUD_API_ROUTES,
  params?: { sessionId?: string },
): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const template = CLOUD_API_ROUTES[route];
  const resolvedPath = params?.sessionId
    ? template.replace(":id", encodeURIComponent(params.sessionId))
    : template;

  return `${normalizedBase}${resolvedPath}`;
}
