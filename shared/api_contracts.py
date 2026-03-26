from __future__ import annotations

from dataclasses import dataclass, field

from .models import (
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
)


@dataclass(slots=True)
class CreateSessionRequest:
    title: str
    device_id: str
    started_at: Timestamp
    classroom_label: str | None = None
    client_session_id: str | None = None
    device_ip_address: str | None = None


@dataclass(slots=True)
class CreateSessionResponse:
    session: Session


@dataclass(slots=True)
class UploadAudioChunkMetadataRequest:
    session_id: str
    audio_chunk: AudioChunk


@dataclass(slots=True)
class UploadArtifactRef:
    storage_key: str | None = None
    content_type: str | None = None
    original_file_name: str | None = None
    file_size_bytes: int | None = None


@dataclass(slots=True)
class UploadAudioChunkRequest:
    session_id: str
    audio_chunk: AudioChunk
    artifact: UploadArtifactRef | None = None


@dataclass(slots=True)
class UploadAudioChunkMetadataResponse:
    audio_chunk: AudioChunk
    receipt: UploadReceipt


@dataclass(slots=True)
class UploadImageMetadataRequest:
    session_id: str
    captured_image: CapturedImage


@dataclass(slots=True)
class UploadImageRequest:
    session_id: str
    captured_image: CapturedImage
    artifact: UploadArtifactRef | None = None


@dataclass(slots=True)
class UploadImageMetadataResponse:
    captured_image: CapturedImage
    receipt: UploadReceipt


@dataclass(slots=True)
class MarkSessionEndedRequest:
    session_id: str
    ended_at: Timestamp
    stop_reason: str | None = None
    last_audio_sequence_number: int | None = None
    last_image_sequence_number: int | None = None


@dataclass(slots=True)
class MarkSessionEndedResponse:
    session: Session
    receipt: UploadReceipt


@dataclass(slots=True)
class HeartbeatRequest:
    session_id: str
    observed_at: Timestamp
    queued_upload_count: int | None = None
    last_audio_sequence_number: int | None = None
    last_image_sequence_number: int | None = None
    runtime_status: str | None = None
    device_ip_address: str | None = None


@dataclass(slots=True)
class HeartbeatResponse:
    session_id: str
    received_at: Timestamp
    status: SessionStatus


@dataclass(slots=True)
class RequestProcessingRequest:
    session_id: str
    requested_at: Timestamp
    force_reprocess: bool = False
    reason: str | None = None


@dataclass(slots=True)
class RequestProcessingResponse:
    session_id: str
    job_id: str
    status: ProcessingJobStatus
    queued_at: Timestamp


@dataclass(slots=True)
class FetchSessionResultsRequest:
    session_id: str
    include_transcript: bool = True
    include_visual_artifacts: bool = True
    include_final_notes: bool = True


@dataclass(slots=True)
class FetchSessionResultsResponse:
    session: Session
    audio_chunks: list[AudioChunk] = field(default_factory=list)
    transcript_segments: list[TranscriptSegment] = field(default_factory=list)
    speaker_segments: list[SpeakerSegment] = field(default_factory=list)
    captured_images: list[CapturedImage] = field(default_factory=list)
    ocr_results: list[OCRResult] = field(default_factory=list)
    vision_results: list[VisionResult] = field(default_factory=list)
    mode_windows: list[ModeWindow] = field(default_factory=list)
    final_notes: FinalNotes | None = None
    processing_job_status: ProcessingJobStatus | None = None
    upload_receipts: list[UploadReceipt] = field(default_factory=list)
    uncertainty_flags: list[UncertaintyFlag] = field(default_factory=list)
