from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


Timestamp = str
EntityId = str

ClassMode = Literal["slides", "handwriting", "just_talking"]
UploadKind = Literal["audio", "image", "session_event"]
UploadStatus = Literal["pending", "uploaded", "failed"]
UploadReceiptStatus = Literal["accepted", "queued", "duplicate", "rejected"]
UncertaintySeverity = Literal["low", "medium", "high"]
UncertaintySource = Literal[
    "session",
    "audio",
    "transcript",
    "image",
    "ocr",
    "vision",
    "notes",
    "upload",
    "processing",
]


class SessionStatus(str, Enum):
    PENDING = "pending"
    CAPTURING = "capturing"
    UPLOADING = "uploading"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


class ProcessingJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(slots=True)
class UncertaintyFlag:
    kind: str
    severity: UncertaintySeverity
    message: str
    source: UncertaintySource
    related_id: str | None = None
    created_at: Timestamp | None = None


@dataclass(slots=True)
class TranscriptAnchor:
    start_ms: int
    end_ms: int
    transcript_segment_ids: list[str] = field(default_factory=list)


@dataclass(slots=True)
class NormalizedBoundingBox:
    x: float
    y: float
    width: float
    height: float


@dataclass(slots=True)
class AudioChunk:
    id: str
    session_id: str
    sequence_number: int
    captured_at: Timestamp
    duration_ms: int
    sample_rate_hz: int
    channels: int
    upload_status: UploadStatus = "pending"
    local_path: str | None = None
    storage_key: str | None = None
    uploaded_at: Timestamp | None = None
    checksum_sha256: str | None = None
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class TranscriptSegment:
    id: str
    session_id: str
    chunk_id: str
    start_ms: int
    end_ms: int
    text: str
    source_model: str = "parakeet-ctc-v3"
    confidence: float | None = None
    speaker_id: str | None = None
    is_primary_speaker: bool | None = None
    linked_image_ids: list[str] = field(default_factory=list)
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class SpeakerSegment:
    id: str
    session_id: str
    start_ms: int
    end_ms: int
    speaker_label: str
    confidence: float | None = None
    is_primary_candidate: bool = False
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class CapturedImage:
    id: str
    session_id: str
    sequence_number: int
    captured_at: Timestamp
    accepted_for_processing: bool = True
    local_path: str | None = None
    storage_key: str | None = None
    uploaded_at: Timestamp | None = None
    diff_score: float | None = None
    blur_score: float | None = None
    quality_score: float | None = None
    mode_hint: ClassMode | None = None
    transcript_anchor: TranscriptAnchor | None = None
    nearby_transcript_segment_ids: list[str] = field(default_factory=list)
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class OCRBlock:
    id: str
    image_id: str
    text: str
    bounding_box: NormalizedBoundingBox
    confidence: float | None = None
    line_index: int | None = None
    transcript_anchor: TranscriptAnchor | None = None
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class OCRResult:
    id: str
    image_id: str
    text: str
    engine: str = "tbd"
    blocks: list[OCRBlock] = field(default_factory=list)
    confidence: float | None = None
    transcript_anchor: TranscriptAnchor | None = None
    nearby_transcript_segment_ids: list[str] = field(default_factory=list)
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class VisionResult:
    id: str
    image_id: str
    model: str = "moondream-3"
    summary: str = ""
    extracted_text_cues: list[str] = field(default_factory=list)
    supporting_ocr_block_ids: list[str] = field(default_factory=list)
    scene_type: ClassMode | None = None
    confidence: float | None = None
    transcript_anchor: TranscriptAnchor | None = None
    nearby_transcript_segment_ids: list[str] = field(default_factory=list)
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class ModeWindow:
    id: str
    session_id: str
    start_ms: int
    end_ms: int
    mode: ClassMode
    rationale: str = ""
    confidence: float | None = None
    transcript_segment_ids: list[str] = field(default_factory=list)
    image_ids: list[str] = field(default_factory=list)
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class NoteSection:
    id: str
    session_id: str
    title: str
    start_ms: int
    end_ms: int
    content: str
    transcript_segment_ids: list[str] = field(default_factory=list)
    image_ids: list[str] = field(default_factory=list)
    ocr_result_ids: list[str] = field(default_factory=list)
    vision_result_ids: list[str] = field(default_factory=list)
    mode: ClassMode | None = None
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class FinalNotes:
    id: str
    session_id: str
    created_at: Timestamp
    sections: list[NoteSection] = field(default_factory=list)
    mode_windows: list[ModeWindow] = field(default_factory=list)
    transcript_segment_ids: list[str] = field(default_factory=list)
    image_ids: list[str] = field(default_factory=list)
    updated_at: Timestamp | None = None
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class UploadReceipt:
    id: str
    session_id: str
    kind: UploadKind
    entity_id: str
    status: UploadReceiptStatus
    received_at: Timestamp
    acknowledged_at: Timestamp | None = None
    storage_key: str | None = None
    message: str | None = None
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)


@dataclass(slots=True)
class Session:
    id: str
    title: str
    started_at: Timestamp
    status: SessionStatus = SessionStatus.PENDING
    device_id: str = "raspberry-pi-4b"
    classroom_label: str | None = None
    ended_at: Timestamp | None = None
    created_at: Timestamp | None = None
    updated_at: Timestamp | None = None
    primary_speaker_label: str | None = None
    processing_job_status: ProcessingJobStatus | None = None
    final_notes_id: str | None = None
    device_ip_address: str | None = None
    mode_windows: list[ModeWindow] = field(default_factory=list)
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)

