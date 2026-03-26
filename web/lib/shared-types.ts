export type Timestamp = string;

export type SessionStatus =
  | "pending"
  | "capturing"
  | "uploading"
  | "processing"
  | "complete"
  | "failed";

export type ProcessingJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ClassMode = "slides" | "handwriting" | "just_talking";
export type UploadKind = "audio" | "image" | "session_event";
export type UploadStatus = "pending" | "uploaded" | "failed";
export type UploadReceiptStatus = "accepted" | "queued" | "duplicate" | "rejected";
export type UncertaintySeverity = "low" | "medium" | "high";
export type UncertaintySource =
  | "session"
  | "audio"
  | "transcript"
  | "image"
  | "ocr"
  | "vision"
  | "notes"
  | "upload"
  | "processing";

export interface UncertaintyFlag {
  kind: string;
  severity: UncertaintySeverity;
  message: string;
  source: UncertaintySource;
  relatedId?: string;
  createdAt?: Timestamp;
}

export interface TranscriptAnchor {
  startMs: number;
  endMs: number;
  transcriptSegmentIds: string[];
}

export interface NormalizedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Session {
  id: string;
  title: string;
  startedAt: Timestamp;
  status: SessionStatus;
  deviceId: string;
  classroomLabel?: string;
  endedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  primarySpeakerLabel?: string;
  processingJobStatus?: ProcessingJobStatus;
  finalNotesId?: string;
  modeWindows: ModeWindow[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface AudioChunk {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  capturedAt: Timestamp;
  durationMs: number;
  sampleRateHz: number;
  channels: number;
  uploadStatus: UploadStatus;
  localPath?: string;
  storageKey?: string;
  uploadedAt?: Timestamp;
  checksumSha256?: string;
  uncertaintyFlags?: UncertaintyFlag[];
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  chunkId: string;
  startMs: number;
  endMs: number;
  text: string;
  sourceModel: "parakeet-ctc-v3";
  confidence?: number;
  speakerId?: string;
  isPrimarySpeaker?: boolean;
  linkedImageIds?: string[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface SpeakerSegment {
  id: string;
  sessionId: string;
  startMs: number;
  endMs: number;
  speakerLabel: string;
  confidence?: number;
  isPrimaryCandidate: boolean;
  uncertaintyFlags?: UncertaintyFlag[];
}

export interface CapturedImage {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  capturedAt: Timestamp;
  acceptedForProcessing: boolean;
  localPath?: string;
  storageKey?: string;
  uploadedAt?: Timestamp;
  diffScore?: number;
  blurScore?: number;
  qualityScore?: number;
  modeHint?: ClassMode;
  transcriptAnchor?: TranscriptAnchor;
  nearbyTranscriptSegmentIds?: string[];
  uncertaintyFlags?: UncertaintyFlag[];
}

export interface OCRBlock {
  id: string;
  imageId: string;
  text: string;
  boundingBox: NormalizedBoundingBox;
  confidence?: number;
  lineIndex?: number;
  transcriptAnchor?: TranscriptAnchor;
  uncertaintyFlags: UncertaintyFlag[];
}

export interface OCRResult {
  id: string;
  imageId: string;
  text: string;
  engine: string;
  blocks: OCRBlock[];
  confidence?: number;
  transcriptAnchor?: TranscriptAnchor;
  nearbyTranscriptSegmentIds: string[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface VisionResult {
  id: string;
  imageId: string;
  model: "moondream-3";
  summary: string;
  extractedTextCues: string[];
  supportingOcrBlockIds: string[];
  sceneType?: ClassMode;
  confidence?: number;
  transcriptAnchor?: TranscriptAnchor;
  nearbyTranscriptSegmentIds: string[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface ModeWindow {
  id: string;
  sessionId: string;
  startMs: number;
  endMs: number;
  mode: ClassMode;
  rationale: string;
  confidence?: number;
  transcriptSegmentIds: string[];
  imageIds: string[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface NoteSection {
  id: string;
  sessionId: string;
  title: string;
  startMs: number;
  endMs: number;
  content: string;
  transcriptSegmentIds: string[];
  imageIds: string[];
  ocrResultIds: string[];
  visionResultIds: string[];
  mode?: ClassMode;
  uncertaintyFlags: UncertaintyFlag[];
}

export interface FinalNotes {
  id: string;
  sessionId: string;
  createdAt: Timestamp;
  sections: NoteSection[];
  modeWindows: ModeWindow[];
  transcriptSegmentIds: string[];
  imageIds: string[];
  updatedAt?: Timestamp;
  uncertaintyFlags: UncertaintyFlag[];
}

export interface UploadReceipt {
  id: string;
  sessionId: string;
  kind: UploadKind;
  entityId: string;
  status: UploadReceiptStatus;
  receivedAt: Timestamp;
  acknowledgedAt?: Timestamp;
  storageKey?: string;
  message?: string;
  uncertaintyFlags: UncertaintyFlag[];
}
