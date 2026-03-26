import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  // Devices (Raspberry Pi units in classrooms)
  devices: defineTable({
    name: v.string(),
    location: v.optional(v.string()),
    hardwareId: v.string(), // unique identifier from the Pi
    lastSeenAt: v.optional(v.number()),
    isActive: v.boolean(),
  }).index("by_hardware_id", ["hardwareId"]),

  // Courses / Classes
  courses: defineTable({
    name: v.string(),
    code: v.optional(v.string()), // e.g. "CS101"
    instructorName: v.optional(v.string()),
    ownerId: v.id("users"),
    deviceId: v.optional(v.id("devices")),
    description: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  // Recording sessions
  sessions: defineTable({
    courseId: v.id("courses"),
    deviceId: v.optional(v.id("devices")),
    title: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    status: v.union(
      v.literal("recording"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    processingProgress: v.optional(v.number()), // 0-100
    notes: v.optional(v.string()), // freeform session notes
  })
    .index("by_course", ["courseId"])
    .index("by_status", ["status"]),

  // Raw audio chunks uploaded from the Pi
  audioChunks: defineTable({
    sessionId: v.id("sessions"),
    chunkIndex: v.number(),
    startOffsetSeconds: v.number(),
    endOffsetSeconds: v.number(),
    // TODO: replace with UploadThing file key when ingest is wired
    uploadthingKey: v.optional(v.string()),
    uploadthingUrl: v.optional(v.string()),
    status: v.union(
      v.literal("uploaded"),
      v.literal("transcribing"),
      v.literal("done"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_chunk", ["sessionId", "chunkIndex"]),

  // Still images captured by the Pi (whiteboard, slides, etc.)
  capturedImages: defineTable({
    sessionId: v.id("sessions"),
    capturedAtOffset: v.number(), // seconds from session start
    capturedAtWall: v.number(), // unix ms
    // TODO: replace with UploadThing file key when ingest is wired
    uploadthingKey: v.optional(v.string()),
    uploadthingUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    label: v.optional(v.string()), // e.g. "Slide 3", "Whiteboard"
    ocrResultId: v.optional(v.id("ocrResults")),
    visionResultId: v.optional(v.id("visionResults")),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_offset", ["sessionId", "capturedAtOffset"]),

  // Transcript segments from Whisper / ASR
  transcriptSegments: defineTable({
    sessionId: v.id("sessions"),
    audioChunkId: v.optional(v.id("audioChunks")),
    startOffsetSeconds: v.number(),
    endOffsetSeconds: v.number(),
    text: v.string(),
    confidence: v.optional(v.number()), // 0-1
    speakerId: v.optional(v.string()), // diarization label
    language: v.optional(v.string()),
    // TODO: populated by ASR processing job
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_start", ["sessionId", "startOffsetSeconds"]),

  // Speaker diarization segments
  speakerSegments: defineTable({
    sessionId: v.id("sessions"),
    speakerId: v.string(), // "SPEAKER_00", "SPEAKER_01", etc.
    displayName: v.optional(v.string()), // user-assigned label
    startOffsetSeconds: v.number(),
    endOffsetSeconds: v.number(),
    // TODO: populated by diarization processing job
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_speaker", ["sessionId", "speakerId"]),

  // OCR results from captured images
  ocrResults: defineTable({
    sessionId: v.id("sessions"),
    imageId: v.id("capturedImages"),
    rawText: v.string(),
    structuredLines: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    processedAt: v.number(),
    // TODO: populated by OCR processing job (e.g. Tesseract / Google Vision)
  })
    .index("by_session", ["sessionId"])
    .index("by_image", ["imageId"]),

  // Vision/LLM understanding of images
  visionResults: defineTable({
    sessionId: v.id("sessions"),
    imageId: v.id("capturedImages"),
    description: v.string(), // LLM-generated description
    detectedContentType: v.optional(
      v.union(
        v.literal("slide"),
        v.literal("whiteboard"),
        v.literal("diagram"),
        v.literal("text"),
        v.literal("other")
      )
    ),
    keyPoints: v.optional(v.array(v.string())),
    processedAt: v.number(),
    // TODO: populated by vision LLM job (e.g. GPT-4o vision)
  })
    .index("by_session", ["sessionId"])
    .index("by_image", ["imageId"]),

  // Mode windows: what was happening at a given time
  modeWindows: defineTable({
    sessionId: v.id("sessions"),
    startOffsetSeconds: v.number(),
    endOffsetSeconds: v.number(),
    mode: v.union(
      v.literal("lecture"),
      v.literal("qa"),
      v.literal("discussion"),
      v.literal("activity"),
      v.literal("break"),
      v.literal("unknown")
    ),
    confidence: v.optional(v.number()),
    // TODO: populated by mode detection model
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_start", ["sessionId", "startOffsetSeconds"]),

  // AI-generated note sections
  noteSections: defineTable({
    sessionId: v.id("sessions"),
    orderIndex: v.number(),
    heading: v.string(),
    body: v.string(), // markdown
    startOffsetSeconds: v.optional(v.number()),
    endOffsetSeconds: v.optional(v.number()),
    sourceTranscriptIds: v.optional(v.array(v.id("transcriptSegments"))),
    sourceImageIds: v.optional(v.array(v.id("capturedImages"))),
    isUserEdited: v.boolean(),
    // TODO: initially generated by LLM summarization job, then user-editable
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_order", ["sessionId", "orderIndex"]),

  // Uncertainty / review-needed flags
  uncertaintyFlags: defineTable({
    sessionId: v.id("sessions"),
    offsetSeconds: v.optional(v.number()),
    kind: v.union(
      v.literal("low_confidence_transcript"),
      v.literal("unclear_audio"),
      v.literal("ocr_uncertain"),
      v.literal("speaker_unknown"),
      v.literal("content_gap"),
      v.literal("user_flagged")
    ),
    description: v.string(),
    severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    relatedTranscriptId: v.optional(v.id("transcriptSegments")),
    relatedImageId: v.optional(v.id("capturedImages")),
    isResolved: v.boolean(),
    resolvedNote: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_resolved", ["sessionId", "isResolved"]),

  // Processing jobs tracker
  processingJobs: defineTable({
    sessionId: v.id("sessions"),
    jobType: v.union(
      v.literal("transcription"),
      v.literal("diarization"),
      v.literal("ocr"),
      v.literal("vision"),
      v.literal("mode_detection"),
      v.literal("note_generation"),
      v.literal("full_pipeline")
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("error")
    ),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    metadata: v.optional(v.string()), // JSON string for extra context
    // TODO: triggered by ingest webhook from Pi upload
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_type", ["sessionId", "jobType"])
    .index("by_status", ["status"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
