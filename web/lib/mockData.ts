import { buildSessionDetailView, type SessionDetailView } from "@/lib/api-contracts";
import type {
  AudioChunk,
  CapturedImage,
  FinalNotes,
  OCRResult,
  Session,
  SpeakerSegment,
  TranscriptSegment,
  UncertaintyFlag,
  UploadReceipt,
  VisionResult,
} from "@/lib/shared-types";

export type SessionViewBundle = SessionDetailView;

const sessionId = "session_demo_001";

const noteReviewFlag: UncertaintyFlag = {
  kind: "unclear-board-handwriting",
  severity: "medium",
  message: "A few whiteboard terms are only partially legible, so the notes keep that uncertainty visible.",
  source: "notes",
  relatedId: "note_transport_equation",
  createdAt: "2026-03-24T14:16:00Z",
};

const sideConversationFlag: UncertaintyFlag = {
  kind: "side-conversation",
  severity: "medium",
  message: "Short overlapping student speech was detected and deprioritized relative to the lecture speaker.",
  source: "transcript",
  relatedId: "transcript_seg_003",
  createdAt: "2026-03-24T14:14:55Z",
};

const croppedSlideFlag: UncertaintyFlag = {
  kind: "partial-slide-text",
  severity: "low",
  message: "Bottom-right slide text may be cropped in the captured image.",
  source: "ocr",
  relatedId: "ocr_block_2",
  createdAt: "2026-03-24T14:13:40Z",
};

const transcriptSegments: TranscriptSegment[] = [
  {
    id: "transcript_seg_001",
    sessionId,
    chunkId: "audio_chunk_001",
    startMs: 0,
    endMs: 18000,
    text: "Today we are looking at passive transport and why diffusion moves particles down a concentration gradient.",
    sourceModel: "parakeet-ctc-v3",
    confidence: 0.94,
    speakerId: "speaker_professor",
    isPrimarySpeaker: true,
    linkedImageIds: ["captured_image_001"],
    uncertaintyFlags: [],
  },
  {
    id: "transcript_seg_002",
    sessionId,
    chunkId: "audio_chunk_002",
    startMs: 18000,
    endMs: 41000,
    text: "As you can see on this diagram, diffusion continues until the concentrations are more evenly distributed.",
    sourceModel: "parakeet-ctc-v3",
    confidence: 0.91,
    speakerId: "speaker_professor",
    isPrimarySpeaker: true,
    linkedImageIds: ["captured_image_001"],
    uncertaintyFlags: [],
  },
  {
    id: "transcript_seg_003",
    sessionId,
    chunkId: "audio_chunk_002",
    startMs: 41000,
    endMs: 52000,
    text: "Possible student side conversation near the back of the room.",
    sourceModel: "parakeet-ctc-v3",
    confidence: 0.43,
    speakerId: "speaker_unknown",
    isPrimarySpeaker: false,
    uncertaintyFlags: [sideConversationFlag],
  },
  {
    id: "transcript_seg_004",
    sessionId,
    chunkId: "audio_chunk_003",
    startMs: 52000,
    endMs: 87000,
    text: "Write this down: osmosis is the diffusion of water across a selectively permeable membrane.",
    sourceModel: "parakeet-ctc-v3",
    confidence: 0.9,
    speakerId: "speaker_professor",
    isPrimarySpeaker: true,
    linkedImageIds: ["captured_image_002"],
    uncertaintyFlags: [],
  },
];

const capturedImages: CapturedImage[] = [
  {
    id: "captured_image_001",
    sessionId,
    sequenceNumber: 1,
    capturedAt: "2026-03-24T14:02:03Z",
    acceptedForProcessing: true,
    storageKey: "demo/session_demo_001/images/slide_diffusion.jpg",
    uploadedAt: "2026-03-24T14:02:05Z",
    diffScore: 0.82,
    blurScore: 144.2,
    qualityScore: 0.88,
    modeHint: "slides",
    transcriptAnchor: {
      startMs: 18000,
      endMs: 41000,
      transcriptSegmentIds: ["transcript_seg_002"],
    },
    nearbyTranscriptSegmentIds: ["transcript_seg_001", "transcript_seg_002"],
    uncertaintyFlags: [],
  },
  {
    id: "captured_image_002",
    sessionId,
    sequenceNumber: 2,
    capturedAt: "2026-03-24T14:07:12Z",
    acceptedForProcessing: true,
    storageKey: "demo/session_demo_001/images/board_osmosis.jpg",
    uploadedAt: "2026-03-24T14:07:14Z",
    diffScore: 0.65,
    blurScore: 92.4,
    qualityScore: 0.63,
    modeHint: "handwriting",
    transcriptAnchor: {
      startMs: 52000,
      endMs: 87000,
      transcriptSegmentIds: ["transcript_seg_004"],
    },
    nearbyTranscriptSegmentIds: ["transcript_seg_004"],
    uncertaintyFlags: [
      {
        kind: "mild-motion-blur",
        severity: "medium",
        message: "The board image is usable, but light blur may reduce OCR accuracy.",
        source: "image",
        relatedId: "captured_image_002",
        createdAt: "2026-03-24T14:07:14Z",
      },
    ],
  },
];

const ocrResults: OCRResult[] = [
  {
    id: "ocr_result_001",
    imageId: "captured_image_001",
    text: "Diffusion moves particles from high concentration to low concentration.",
    engine: "TODO_OCR_ADAPTER",
    blocks: [
      {
        id: "ocr_block_1",
        imageId: "captured_image_001",
        text: "Diffusion moves particles",
        boundingBox: { x: 0.11, y: 0.17, width: 0.48, height: 0.08 },
        confidence: 0.9,
        lineIndex: 0,
        transcriptAnchor: {
          startMs: 18000,
          endMs: 41000,
          transcriptSegmentIds: ["transcript_seg_002"],
        },
        uncertaintyFlags: [],
      },
      {
        id: "ocr_block_2",
        imageId: "captured_image_001",
        text: "high concentration to low concentration",
        boundingBox: { x: 0.11, y: 0.27, width: 0.57, height: 0.08 },
        confidence: 0.74,
        lineIndex: 1,
        transcriptAnchor: {
          startMs: 18000,
          endMs: 41000,
          transcriptSegmentIds: ["transcript_seg_002"],
        },
        uncertaintyFlags: [croppedSlideFlag],
      },
    ],
    confidence: 0.82,
    transcriptAnchor: {
      startMs: 18000,
      endMs: 41000,
      transcriptSegmentIds: ["transcript_seg_002"],
    },
    nearbyTranscriptSegmentIds: ["transcript_seg_002"],
    uncertaintyFlags: [croppedSlideFlag],
  },
  {
    id: "ocr_result_002",
    imageId: "captured_image_002",
    text: "Osmosis = diffusion of water",
    engine: "TODO_OCR_ADAPTER",
    blocks: [
      {
        id: "ocr_block_3",
        imageId: "captured_image_002",
        text: "Osmosis",
        boundingBox: { x: 0.18, y: 0.12, width: 0.22, height: 0.09 },
        confidence: 0.69,
        lineIndex: 0,
        transcriptAnchor: {
          startMs: 52000,
          endMs: 87000,
          transcriptSegmentIds: ["transcript_seg_004"],
        },
        uncertaintyFlags: [
          {
            kind: "handwriting-partial",
            severity: "medium",
            message: "Handwritten letters are partially merged together in this OCR block.",
            source: "ocr",
            relatedId: "ocr_block_3",
            createdAt: "2026-03-24T14:07:20Z",
          },
        ],
      },
    ],
    confidence: 0.69,
    transcriptAnchor: {
      startMs: 52000,
      endMs: 87000,
      transcriptSegmentIds: ["transcript_seg_004"],
    },
    nearbyTranscriptSegmentIds: ["transcript_seg_004"],
    uncertaintyFlags: [
      {
        kind: "board-handwriting-hard-to-read",
        severity: "medium",
        message: "OCR recovered only the clearest board phrase and left uncertain words out.",
        source: "ocr",
        relatedId: "captured_image_002",
        createdAt: "2026-03-24T14:07:20Z",
      },
    ],
  },
];

const visionResults: VisionResult[] = [
  {
    id: "vision_result_001",
    imageId: "captured_image_001",
    model: "moondream-3",
    summary:
      "Projected slide explains diffusion with a left-to-right particle diagram and headline text matching the lecture explanation.",
    extractedTextCues: ["diffusion", "concentration gradient", "diagram"],
    supportingOcrBlockIds: ["ocr_block_1", "ocr_block_2"],
    sceneType: "slides",
    confidence: 0.84,
    transcriptAnchor: {
      startMs: 18000,
      endMs: 41000,
      transcriptSegmentIds: ["transcript_seg_002"],
    },
    nearbyTranscriptSegmentIds: ["transcript_seg_001", "transcript_seg_002"],
    uncertaintyFlags: [],
  },
  {
    id: "vision_result_002",
    imageId: "captured_image_002",
    model: "moondream-3",
    summary:
      "Whiteboard photo appears to define osmosis with a short handwritten phrase and a partially visible membrane sketch.",
    extractedTextCues: ["write this down", "osmosis", "membrane"],
    supportingOcrBlockIds: ["ocr_block_3"],
    sceneType: "handwriting",
    confidence: 0.67,
    transcriptAnchor: {
      startMs: 52000,
      endMs: 87000,
      transcriptSegmentIds: ["transcript_seg_004"],
    },
    nearbyTranscriptSegmentIds: ["transcript_seg_004"],
    uncertaintyFlags: [noteReviewFlag],
  },
];

const modeWindows = [
  {
    id: "mode_window_001",
    sessionId,
    startMs: 0,
    endMs: 52000,
    mode: "slides" as const,
    rationale: "The lecture is anchored by projected slide content and diagram references.",
    confidence: 0.93,
    transcriptSegmentIds: ["transcript_seg_001", "transcript_seg_002"],
    imageIds: ["captured_image_001"],
    uncertaintyFlags: [],
  },
  {
    id: "mode_window_002",
    sessionId,
    startMs: 52000,
    endMs: 87000,
    mode: "handwriting" as const,
    rationale: "The professor shifts to the board and explicitly asks students to write the definition down.",
    confidence: 0.86,
    transcriptSegmentIds: ["transcript_seg_004"],
    imageIds: ["captured_image_002"],
    uncertaintyFlags: [noteReviewFlag],
  },
];

const finalNotes: FinalNotes = {
  id: "final_notes_001",
  sessionId,
  createdAt: "2026-03-24T14:16:30Z",
  updatedAt: "2026-03-24T14:17:00Z",
  sections: [
    {
      id: "note_diffusion_intro",
      sessionId,
      title: "Diffusion as passive transport",
      startMs: 0,
      endMs: 41000,
      content:
        "The lecture explains diffusion as passive transport, emphasizing that particles move from higher concentration toward lower concentration. The slide image and OCR support that definition, including a diagram the instructor points students to verbally.",
      transcriptSegmentIds: ["transcript_seg_001", "transcript_seg_002"],
      imageIds: ["captured_image_001"],
      ocrResultIds: ["ocr_result_001"],
      visionResultIds: ["vision_result_001"],
      mode: "slides",
      uncertaintyFlags: [croppedSlideFlag],
    },
    {
      id: "note_transport_equation",
      sessionId,
      title: "Osmosis definition to review",
      startMs: 52000,
      endMs: 87000,
      content:
        "The professor asks students to write down that osmosis is the diffusion of water across a selectively permeable membrane. The board image reinforces that point, but some handwriting remains partially unclear, so only the high-confidence wording is included here.",
      transcriptSegmentIds: ["transcript_seg_004"],
      imageIds: ["captured_image_002"],
      ocrResultIds: ["ocr_result_002"],
      visionResultIds: ["vision_result_002"],
      mode: "handwriting",
      uncertaintyFlags: [noteReviewFlag],
    },
  ],
  modeWindows,
  transcriptSegmentIds: transcriptSegments.map((segment) => segment.id),
  imageIds: capturedImages.map((image) => image.id),
  uncertaintyFlags: [sideConversationFlag, noteReviewFlag],
};

const uploadReceipts: UploadReceipt[] = [
  {
    id: "upload_receipt_001",
    sessionId,
    kind: "audio",
    entityId: "audio_chunk_001",
    status: "accepted",
    receivedAt: "2026-03-24T14:00:18Z",
    acknowledgedAt: "2026-03-24T14:00:18Z",
    storageKey: "demo/session_demo_001/audio/audio_chunk_001.wav",
    uncertaintyFlags: [],
  },
  {
    id: "upload_receipt_002",
    sessionId,
    kind: "image",
    entityId: "captured_image_001",
    status: "accepted",
    receivedAt: "2026-03-24T14:02:05Z",
    acknowledgedAt: "2026-03-24T14:02:05Z",
    storageKey: "demo/session_demo_001/images/slide_diffusion.jpg",
    uncertaintyFlags: [],
  },
];

const bundle = buildSessionDetailView({
  session: {
    id: sessionId,
    title: "Intro Biology - Cell Transport",
    startedAt: "2026-03-24T14:00:00Z",
    endedAt: "2026-03-24T14:15:00Z",
    status: "complete",
    deviceId: "raspberry-pi-4b-classroom-a",
    classroomLabel: "Room 101",
    createdAt: "2026-03-24T14:00:00Z",
    updatedAt: "2026-03-24T14:17:00Z",
    primarySpeakerLabel: "Professor",
    processingJobStatus: "completed",
    finalNotesId: finalNotes.id,
    modeWindows,
    uncertaintyFlags: [
      {
        kind: "review-needed",
        severity: "medium",
        message: "Board-derived content needs a quick human pass because some handwriting remains uncertain.",
        source: "session",
        relatedId: "captured_image_002",
        createdAt: "2026-03-24T14:17:00Z",
      },
    ],
  },
  audioChunks: [
    {
      id: "audio_chunk_001",
      sessionId,
      sequenceNumber: 1,
      capturedAt: "2026-03-24T14:00:15Z",
      durationMs: 15000,
      sampleRateHz: 16000,
      channels: 1,
      uploadStatus: "uploaded",
      storageKey: "demo/session_demo_001/audio/audio_chunk_001.wav",
      uploadedAt: "2026-03-24T14:00:18Z",
      checksumSha256: "demo-checksum-001",
      uncertaintyFlags: [],
    },
    {
      id: "audio_chunk_002",
      sessionId,
      sequenceNumber: 2,
      capturedAt: "2026-03-24T14:00:30Z",
      durationMs: 15000,
      sampleRateHz: 16000,
      channels: 1,
      uploadStatus: "uploaded",
      storageKey: "demo/session_demo_001/audio/audio_chunk_002.wav",
      uploadedAt: "2026-03-24T14:00:33Z",
      checksumSha256: "demo-checksum-002",
      uncertaintyFlags: [sideConversationFlag],
    },
    {
      id: "audio_chunk_003",
      sessionId,
      sequenceNumber: 3,
      capturedAt: "2026-03-24T14:00:45Z",
      durationMs: 15000,
      sampleRateHz: 16000,
      channels: 1,
      uploadStatus: "uploaded",
      storageKey: "demo/session_demo_001/audio/audio_chunk_003.wav",
      uploadedAt: "2026-03-24T14:00:48Z",
      checksumSha256: "demo-checksum-003",
      uncertaintyFlags: [],
    },
  ],
  transcriptSegments,
  speakerSegments: [
    {
      id: "speaker_segment_001",
      sessionId,
      startMs: 0,
      endMs: 41000,
      speakerLabel: "Professor",
      confidence: 0.92,
      isPrimaryCandidate: true,
      uncertaintyFlags: [],
    },
    {
      id: "speaker_segment_002",
      sessionId,
      startMs: 41000,
      endMs: 52000,
      speakerLabel: "Unknown speaker",
      confidence: 0.48,
      isPrimaryCandidate: false,
      uncertaintyFlags: [sideConversationFlag],
    },
  ],
  capturedImages,
  ocrResults,
  visionResults,
  modeWindows,
  finalNotes,
  processingJobStatus: "completed",
  uploadReceipts,
  uncertaintyFlags: [sideConversationFlag, noteReviewFlag, croppedSlideFlag],
}) satisfies SessionDetailView;

export function getDemoSessions(): Session[] {
  return [bundle.session];
}

export function getSessionBundle(id: string): SessionViewBundle | null {
  return id === sessionId ? bundle : null;
}

export function collectSessionReviewFlags(bundleToReview: SessionViewBundle): UncertaintyFlag[] {
  return [
    ...bundleToReview.session.uncertaintyFlags,
    ...(bundleToReview.finalNotes?.uncertaintyFlags ?? []),
    ...(bundleToReview.finalNotes?.sections.flatMap((section) => section.uncertaintyFlags) ?? []),
    ...bundleToReview.transcriptSegments.flatMap((segment) => segment.uncertaintyFlags),
    ...bundleToReview.capturedImages.flatMap((image) => image.uncertaintyFlags ?? []),
    ...bundleToReview.ocrResults.flatMap((result) => result.uncertaintyFlags),
    ...bundleToReview.visionResults.flatMap((result) => result.uncertaintyFlags),
  ].sort((left, right) => {
    const score = { high: 0, medium: 1, low: 2 };
    return score[left.severity] - score[right.severity];
  });
}
