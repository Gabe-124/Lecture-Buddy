import type {
  CreateSessionRequest,
  HeartbeatRequest,
  HeartbeatResponse,
  MarkSessionEndedRequest,
  SessionDetailView,
  UploadAudioChunkMetadataResponse,
  UploadAudioChunkRequest,
  UploadImageMetadataResponse,
  UploadImageRequest,
} from "../../shared/api";
import type {
  AudioChunk,
  CapturedImage,
  FinalNotes,
  ModeWindow,
  OCRResult,
  ProcessingJobStatus,
  Session,
  SpeakerSegment,
  TranscriptSegment,
  UncertaintyFlag,
  UploadReceipt,
  UploadReceiptStatus,
  VisionResult,
} from "../../shared/types";
import { nowIsoString } from "../ingest/types";
import {
  InMemoryJobOrchestrator,
  type ProcessingJob,
} from "../workers/job_orchestrator";
import type { SessionWorkerOutput } from "../workers/process_session";

interface SessionRecord {
  session: Session;
  audioChunks: AudioChunk[];
  transcriptSegments: TranscriptSegment[];
  speakerSegments: SpeakerSegment[];
  capturedImages: CapturedImage[];
  ocrResults: OCRResult[];
  visionResults: VisionResult[];
  modeWindows: ModeWindow[];
  finalNotes: FinalNotes | null;
  uploadReceipts: UploadReceipt[];
  uncertaintyFlags: UncertaintyFlag[];
  processingJobId?: string;
}

let uploadReceiptSequence = 0;

export class InMemorySessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly orchestrator: InMemoryJobOrchestrator;

  constructor(orchestrator: InMemoryJobOrchestrator) {
    this.orchestrator = orchestrator;
  }

  startSession(request: CreateSessionRequest): Session {
    const sessionId = request.clientSessionId?.trim() || `session_${this.sessions.size + 1}`;
    const now = nowIsoString();
    const existing = this.sessions.get(sessionId);

    const session: Session = {
      id: sessionId,
      title: request.title,
      startedAt: request.startedAt,
      status: "capturing",
      deviceId: request.deviceId,
      classroomLabel: request.classroomLabel,
      endedAt: existing?.session.endedAt,
      createdAt: existing?.session.createdAt ?? now,
      updatedAt: now,
      primarySpeakerLabel: existing?.session.primarySpeakerLabel,
      processingJobStatus: existing?.session.processingJobStatus,
      finalNotesId: existing?.session.finalNotesId,
      modeWindows: existing?.modeWindows ?? [],
      uncertaintyFlags: existing?.session.uncertaintyFlags ?? [],
    };

    this.sessions.set(sessionId, {
      session,
      audioChunks: existing?.audioChunks ?? [],
      transcriptSegments: existing?.transcriptSegments ?? [],
      speakerSegments: existing?.speakerSegments ?? [],
      capturedImages: existing?.capturedImages ?? [],
      ocrResults: existing?.ocrResults ?? [],
      visionResults: existing?.visionResults ?? [],
      modeWindows: existing?.modeWindows ?? [],
      finalNotes: existing?.finalNotes ?? null,
      uploadReceipts: existing?.uploadReceipts ?? [],
      uncertaintyFlags: existing?.uncertaintyFlags ?? [],
      processingJobId: existing?.processingJobId,
    });

    const record = this.requireSessionRecord(sessionId);
    record.uploadReceipts.push(
      buildUploadReceipt({
        sessionId,
        kind: "session_event",
        entityId: sessionId,
        status: "accepted",
        storageKey: undefined,
        message: "Session start accepted by cloud API.",
      }),
    );

    return record.session;
  }

  recordAudioUpload(request: UploadAudioChunkRequest): UploadAudioChunkMetadataResponse {
    const record = this.requireSessionRecord(request.sessionId);
    const existing = record.audioChunks.find((chunk) => chunk.id === request.audioChunk.id);
    if (existing) {
      return {
        audioChunk: existing,
        receipt: buildUploadReceipt({
          sessionId: request.sessionId,
          kind: "audio",
          entityId: existing.id,
          status: "duplicate",
          storageKey: existing.storageKey,
          message: "Audio chunk id already exists in this session.",
        }),
      };
    }

    const uploadedAt = nowIsoString();
    const audioChunk: AudioChunk = {
      ...request.audioChunk,
      sessionId: request.sessionId,
      storageKey: request.artifact?.storageKey ?? request.audioChunk.storageKey,
      uploadStatus: "uploaded",
      uploadedAt,
      uncertaintyFlags: request.audioChunk.uncertaintyFlags ?? [],
    };

    record.audioChunks.push(audioChunk);
    record.session.status = "capturing";
    record.session.updatedAt = uploadedAt;

    const receipt = buildUploadReceipt({
      sessionId: request.sessionId,
      kind: "audio",
      entityId: audioChunk.id,
      status: "accepted",
      storageKey: audioChunk.storageKey,
      message: "Audio chunk accepted by cloud API.",
    });
    record.uploadReceipts.push(receipt);

    return { audioChunk, receipt };
  }

  recordImageUpload(request: UploadImageRequest): UploadImageMetadataResponse {
    const record = this.requireSessionRecord(request.sessionId);
    const existing = record.capturedImages.find((image) => image.id === request.capturedImage.id);
    if (existing) {
      return {
        capturedImage: existing,
        receipt: buildUploadReceipt({
          sessionId: request.sessionId,
          kind: "image",
          entityId: existing.id,
          status: "duplicate",
          storageKey: existing.storageKey,
          message: "Image id already exists in this session.",
        }),
      };
    }

    const uploadedAt = nowIsoString();
    const capturedImage: CapturedImage = {
      ...request.capturedImage,
      sessionId: request.sessionId,
      storageKey: request.artifact?.storageKey ?? request.capturedImage.storageKey,
      uploadedAt,
      nearbyTranscriptSegmentIds: request.capturedImage.nearbyTranscriptSegmentIds ?? [],
      uncertaintyFlags: request.capturedImage.uncertaintyFlags ?? [],
    };

    record.capturedImages.push(capturedImage);
    record.session.status = "capturing";
    record.session.updatedAt = uploadedAt;

    const receipt = buildUploadReceipt({
      sessionId: request.sessionId,
      kind: "image",
      entityId: capturedImage.id,
      status: "accepted",
      storageKey: capturedImage.storageKey,
      message: "Image accepted by cloud API.",
    });
    record.uploadReceipts.push(receipt);

    return { capturedImage, receipt };
  }

  recordHeartbeat(request: HeartbeatRequest): HeartbeatResponse {
    const record = this.requireSessionRecord(request.sessionId);
    const receivedAt = nowIsoString();

    if (record.session.status === "pending" || record.session.status === "uploading") {
      record.session.status = "capturing";
    }
    record.session.updatedAt = receivedAt;

    return {
      sessionId: request.sessionId,
      receivedAt,
      status: record.session.status,
    };
  }

  async endSession(request: MarkSessionEndedRequest): Promise<{
    session: Session;
    receipt: UploadReceipt;
  }> {
    const record = this.requireSessionRecord(request.sessionId);
    const endedAt = request.endedAt;

    record.session.endedAt = endedAt;
    record.session.updatedAt = nowIsoString();
    record.session.status = "processing";

    const receipt = buildUploadReceipt({
      sessionId: request.sessionId,
      kind: "session_event",
      entityId: request.sessionId,
      status: "accepted",
      storageKey: undefined,
      message: request.stopReason
        ? `Session end accepted by cloud API: ${request.stopReason}`
        : "Session end accepted by cloud API.",
    });
    record.uploadReceipts.push(receipt);

    const queuedJob = this.orchestrator.enqueueSession({
      sessionId: request.sessionId,
      audioChunks: record.audioChunks,
      capturedImages: record.capturedImages,
      existingModeWindows: record.modeWindows,
    });
    record.processingJobId = queuedJob.id;
    record.session.processingJobStatus = "queued";

    const completedJob = await this.orchestrator.runJob(queuedJob.id);
    this.applyCompletedJob(record, completedJob);

    return {
      session: record.session,
      receipt,
    };
  }

  getSessionDetail(sessionId: string): SessionDetailView | null {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return null;
    }

    return {
      session: {
        ...record.session,
        modeWindows: record.modeWindows,
        uncertaintyFlags: dedupeUncertaintyFlags([
          ...record.session.uncertaintyFlags,
          ...record.uncertaintyFlags,
        ]),
      },
      audioChunks: record.audioChunks,
      transcriptSegments: record.transcriptSegments,
      speakerSegments: record.speakerSegments,
      capturedImages: record.capturedImages,
      ocrResults: record.ocrResults,
      visionResults: record.visionResults,
      modeWindows: record.modeWindows,
      finalNotes: record.finalNotes,
      processingJobStatus: record.session.processingJobStatus ?? null,
      uploadReceipts: record.uploadReceipts,
      uncertaintyFlags: collectRecordUncertainty(record),
    };
  }

  private applyCompletedJob(record: SessionRecord, job: ProcessingJob): void {
    record.session.updatedAt = nowIsoString();
    record.session.processingJobStatus = toProcessingJobStatus(job.status);

    if (job.status !== "completed" || !job.result) {
      record.session.status = "failed";
      record.uncertaintyFlags = dedupeUncertaintyFlags([
        ...record.uncertaintyFlags,
        {
          kind: "session-processing-failed",
          severity: "high",
          message: job.error ?? "Session processing failed before producing output.",
          source: "processing",
          relatedId: job.id,
        },
      ]);
      return;
    }

    const result = job.result;
    const finalNotes = buildFinalNotes(record.session.id, result);

    record.transcriptSegments = result.transcriptSegments;
    record.speakerSegments = result.speakerSegments;
    record.ocrResults = result.ocrResults;
    record.visionResults = result.visionResults;
    record.modeWindows = result.modeWindows;
    record.finalNotes = finalNotes;
    record.uncertaintyFlags = dedupeUncertaintyFlags([
      ...record.uncertaintyFlags,
      ...result.uncertaintyFlags,
    ]);
    record.session.status = "complete";
    record.session.primarySpeakerLabel = result.primarySpeakerLabel;
    record.session.finalNotesId = finalNotes.id;
    record.session.modeWindows = result.modeWindows;
    record.session.uncertaintyFlags = dedupeUncertaintyFlags([
      ...record.session.uncertaintyFlags,
      ...result.uncertaintyFlags,
    ]);
  }

  private requireSessionRecord(sessionId: string): SessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown session id: ${sessionId}`);
    }
    return record;
  }
}

function buildFinalNotes(sessionId: string, result: SessionWorkerOutput): FinalNotes {
  const createdAt = nowIsoString();
  const uncertaintyFlags = dedupeUncertaintyFlags([
    ...result.uncertaintyFlags,
    ...result.notes.flatMap((noteSection) => noteSection.uncertaintyFlags),
    ...result.modeWindows.flatMap((modeWindow) => modeWindow.uncertaintyFlags),
  ]);

  return {
    id: `final_notes_${sessionId}`,
    sessionId,
    createdAt,
    updatedAt: createdAt,
    sections: result.notes,
    modeWindows: result.modeWindows,
    transcriptSegmentIds: result.transcriptSegments.map((segment) => segment.id),
    imageIds: result.visualContexts.map((context) => context.imageId),
    uncertaintyFlags,
  };
}

function buildUploadReceipt(input: {
  sessionId: string;
  kind: UploadReceipt["kind"];
  entityId: string;
  status: UploadReceiptStatus;
  storageKey?: string;
  message?: string;
}): UploadReceipt {
  const receivedAt = nowIsoString();
  uploadReceiptSequence += 1;

  return {
    id:
      `receipt_${input.kind}_${input.entityId}_${receivedAt.replace(/[^0-9]+/g, "")}_${uploadReceiptSequence}`,
    sessionId: input.sessionId,
    kind: input.kind,
    entityId: input.entityId,
    status: input.status,
    receivedAt,
    acknowledgedAt: receivedAt,
    storageKey: input.storageKey,
    message: input.message,
    uncertaintyFlags: [],
  };
}

function collectRecordUncertainty(record: SessionRecord): UncertaintyFlag[] {
  return dedupeUncertaintyFlags([
    ...record.session.uncertaintyFlags,
    ...record.uncertaintyFlags,
    ...record.audioChunks.flatMap((chunk) => chunk.uncertaintyFlags ?? []),
    ...record.transcriptSegments.flatMap((segment) => segment.uncertaintyFlags),
    ...record.speakerSegments.flatMap((segment) => segment.uncertaintyFlags ?? []),
    ...record.capturedImages.flatMap((image) => image.uncertaintyFlags ?? []),
    ...record.ocrResults.flatMap((result) => result.uncertaintyFlags),
    ...record.visionResults.flatMap((result) => result.uncertaintyFlags),
    ...(record.finalNotes?.uncertaintyFlags ?? []),
    ...(record.finalNotes?.sections.flatMap((section) => section.uncertaintyFlags) ?? []),
  ]);
}

function toProcessingJobStatus(status: ProcessingJob["status"]): ProcessingJobStatus {
  if (status === "queued") {
    return "queued";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "completed") {
    return "completed";
  }
  return "failed";
}

function dedupeUncertaintyFlags(flags: UncertaintyFlag[]): UncertaintyFlag[] {
  const seen = new Set<string>();
  const deduped: UncertaintyFlag[] = [];

  for (const flag of flags) {
    const key = [
      flag.kind,
      flag.severity,
      flag.source,
      flag.message,
      flag.relatedId ?? "",
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(flag);
  }

  return deduped;
}
