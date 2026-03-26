import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const classMode = v.union(
  v.literal("slides"),
  v.literal("handwriting"),
  v.literal("just_talking"),
);

const sessionStatus = v.union(
  v.literal("pending"),
  v.literal("capturing"),
  v.literal("uploading"),
  v.literal("processing"),
  v.literal("complete"),
  v.literal("failed"),
);

const processingJobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const uploadKind = v.union(
  v.literal("audio"),
  v.literal("image"),
  v.literal("session_event"),
);

const uploadStatus = v.union(v.literal("pending"), v.literal("uploaded"), v.literal("failed"));

const uploadReceiptStatus = v.union(
  v.literal("accepted"),
  v.literal("queued"),
  v.literal("duplicate"),
  v.literal("rejected"),
);

const uncertaintySeverity = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

const uncertaintySource = v.union(
  v.literal("session"),
  v.literal("audio"),
  v.literal("transcript"),
  v.literal("image"),
  v.literal("ocr"),
  v.literal("vision"),
  v.literal("notes"),
  v.literal("upload"),
  v.literal("processing"),
);

const uncertaintyFlag = v.object({
  kind: v.string(),
  severity: uncertaintySeverity,
  message: v.string(),
  source: uncertaintySource,
  relatedId: v.optional(v.string()),
  createdAt: v.optional(v.string()),
});

const transcriptAnchor = v.object({
  startMs: v.number(),
  endMs: v.number(),
  transcriptSegmentIds: v.array(v.string()),
});

const normalizedBoundingBox = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
});

const ocrBlock = v.object({
  id: v.string(),
  imageId: v.string(),
  text: v.string(),
  boundingBox: normalizedBoundingBox,
  confidence: v.optional(v.number()),
  lineIndex: v.optional(v.number()),
  transcriptAnchor: v.optional(transcriptAnchor),
  uncertaintyFlags: v.array(uncertaintyFlag),
});

const modeWindowFields = {
  id: v.string(),
  sessionId: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  mode: classMode,
  rationale: v.string(),
  confidence: v.optional(v.number()),
  transcriptSegmentIds: v.array(v.string()),
  imageIds: v.array(v.string()),
  uncertaintyFlags: v.array(uncertaintyFlag),
};

const modeWindow = v.object(modeWindowFields);

const noteSection = v.object({
  id: v.string(),
  sessionId: v.string(),
  title: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  content: v.string(),
  transcriptSegmentIds: v.array(v.string()),
  imageIds: v.array(v.string()),
  ocrResultIds: v.array(v.string()),
  visionResultIds: v.array(v.string()),
  mode: v.optional(classMode),
  uncertaintyFlags: v.array(uncertaintyFlag),
});

export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(),
    title: v.string(),
    startedAt: v.string(),
    status: sessionStatus,
    deviceId: v.string(),
    classroomLabel: v.optional(v.string()),
    endedAt: v.optional(v.string()),
    createdAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
    primarySpeakerLabel: v.optional(v.string()),
    processingJobStatus: v.optional(processingJobStatus),
    finalNotesId: v.optional(v.string()),
    uncertaintyFlags: v.array(uncertaintyFlag),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_status", ["status"]),

  audioChunks: defineTable({
    audioChunkId: v.string(),
    sessionId: v.string(),
    sequenceNumber: v.number(),
    capturedAt: v.string(),
    durationMs: v.number(),
    sampleRateHz: v.number(),
    channels: v.number(),
    uploadStatus,
    localPath: v.optional(v.string()),
    storageKey: v.optional(v.string()),
    uploadedAt: v.optional(v.string()),
    checksumSha256: v.optional(v.string()),
    uncertaintyFlags: v.optional(v.array(uncertaintyFlag)),
  })
    .index("by_chunk_id", ["audioChunkId"])
    .index("by_session", ["sessionId"]),

  transcriptSegments: defineTable({
    transcriptSegmentId: v.string(),
    sessionId: v.string(),
    chunkId: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    text: v.string(),
    sourceModel: v.literal("parakeet-ctc-v3"),
    confidence: v.optional(v.number()),
    speakerId: v.optional(v.string()),
    isPrimarySpeaker: v.optional(v.boolean()),
    linkedImageIds: v.optional(v.array(v.string())),
    uncertaintyFlags: v.array(uncertaintyFlag),
  })
    .index("by_transcript_segment_id", ["transcriptSegmentId"])
    .index("by_session", ["sessionId"]),

  speakerSegments: defineTable({
    speakerSegmentId: v.string(),
    sessionId: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    speakerLabel: v.string(),
    confidence: v.optional(v.number()),
    isPrimaryCandidate: v.boolean(),
    uncertaintyFlags: v.optional(v.array(uncertaintyFlag)),
  })
    .index("by_speaker_segment_id", ["speakerSegmentId"])
    .index("by_session", ["sessionId"]),

  capturedImages: defineTable({
    imageId: v.string(),
    sessionId: v.string(),
    sequenceNumber: v.number(),
    capturedAt: v.string(),
    acceptedForProcessing: v.boolean(),
    localPath: v.optional(v.string()),
    storageKey: v.optional(v.string()),
    uploadedAt: v.optional(v.string()),
    diffScore: v.optional(v.number()),
    blurScore: v.optional(v.number()),
    qualityScore: v.optional(v.number()),
    modeHint: v.optional(classMode),
    transcriptAnchor: v.optional(transcriptAnchor),
    nearbyTranscriptSegmentIds: v.optional(v.array(v.string())),
    uncertaintyFlags: v.optional(v.array(uncertaintyFlag)),
  })
    .index("by_image_id", ["imageId"])
    .index("by_session", ["sessionId"]),

  ocrResults: defineTable({
    ocrResultId: v.string(),
    imageId: v.string(),
    text: v.string(),
    engine: v.string(),
    blocks: v.array(ocrBlock),
    confidence: v.optional(v.number()),
    transcriptAnchor: v.optional(transcriptAnchor),
    nearbyTranscriptSegmentIds: v.array(v.string()),
    uncertaintyFlags: v.array(uncertaintyFlag),
  })
    .index("by_ocr_result_id", ["ocrResultId"])
    .index("by_image", ["imageId"]),

  visionResults: defineTable({
    visionResultId: v.string(),
    imageId: v.string(),
    model: v.literal("moondream-3"),
    summary: v.string(),
    extractedTextCues: v.array(v.string()),
    supportingOcrBlockIds: v.array(v.string()),
    sceneType: v.optional(classMode),
    confidence: v.optional(v.number()),
    transcriptAnchor: v.optional(transcriptAnchor),
    nearbyTranscriptSegmentIds: v.array(v.string()),
    uncertaintyFlags: v.array(uncertaintyFlag),
  })
    .index("by_vision_result_id", ["visionResultId"])
    .index("by_image", ["imageId"]),

  modeWindows: defineTable(modeWindowFields)
    .index("by_mode_window_id", ["id"])
    .index("by_session", ["sessionId"]),

  finalNotes: defineTable({
    finalNotesId: v.string(),
    sessionId: v.string(),
    createdAt: v.string(),
    sections: v.array(noteSection),
    modeWindows: v.array(modeWindow),
    transcriptSegmentIds: v.array(v.string()),
    imageIds: v.array(v.string()),
    updatedAt: v.optional(v.string()),
    uncertaintyFlags: v.array(uncertaintyFlag),
  })
    .index("by_final_notes_id", ["finalNotesId"])
    .index("by_session", ["sessionId"]),

  uploadReceipts: defineTable({
    uploadReceiptId: v.string(),
    sessionId: v.string(),
    kind: uploadKind,
    entityId: v.string(),
    status: uploadReceiptStatus,
    receivedAt: v.string(),
    acknowledgedAt: v.optional(v.string()),
    storageKey: v.optional(v.string()),
    message: v.optional(v.string()),
    uncertaintyFlags: v.array(uncertaintyFlag),
  })
    .index("by_upload_receipt_id", ["uploadReceiptId"])
    .index("by_session", ["sessionId"]),
});
