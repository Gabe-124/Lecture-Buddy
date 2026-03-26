from __future__ import annotations

import json
import logging
import mimetypes
from dataclasses import dataclass, field
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover - validated in health checks
    requests = None  # type: ignore[assignment]

from config import PiClientConfig
from local_queue import FileBackedQueue, QueueUploadItem


@dataclass(slots=True)
class UploadOutcome:
    success: bool
    retry_after_seconds: float = 60.0
    message: str = ""


@dataclass(slots=True)
class CloudUploader:
    config: PiClientConfig
    queue: FileBackedQueue
    logger: logging.Logger = field(
        default_factory=lambda: logging.getLogger(__name__),
        repr=False,
    )

    def flush_ready(self) -> int:
        ready_items = self.queue.get_ready_batch(self.config.upload.batch_size)
        if not ready_items:
            self.logger.debug("No queued uploads are ready.")
            return 0

        uploaded_count = 0
        for item in ready_items:
            outcome = self._upload_item(item)
            if outcome.success:
                self.queue.mark_done(item.id)
                self._cleanup_uploaded_file(item)
                uploaded_count += 1
                continue
            self.queue.mark_retry(item.id, outcome.message, outcome.retry_after_seconds)
        return uploaded_count

    def _upload_item(self, item: QueueUploadItem) -> UploadOutcome:
        if requests is None:
            return UploadOutcome(
                success=False,
                retry_after_seconds=120.0,
                message="requests dependency is not installed",
            )

        headers = {
            "Accept": "application/json",
            "User-Agent": "lecture-buddy-pi-client/1.0",
            "X-Device-Id": self.config.device_id,
        }
        if self.config.upload.api_key:
            headers["Authorization"] = f"Bearer {self.config.upload.api_key}"

        try:
            endpoint = self._resolve_endpoint(item)
            payload = self._build_payload(item)
            if item.file_path:
                return self._upload_file(item, endpoint, headers, payload)
            return self._upload_metadata(item, endpoint, headers, payload)
        except Exception as exc:  # pragma: no cover - depends on network
            self.logger.exception("Unexpected upload error for %s: %s", item.id, exc)
            return UploadOutcome(
                success=False,
                retry_after_seconds=90.0,
                message=f"unexpected upload error: {exc}",
            )

    def _upload_file(
        self,
        item: QueueUploadItem,
        endpoint: str,
        headers: dict[str, str],
        payload: dict[str, object],
    ) -> UploadOutcome:
        file_path = Path(item.file_path or "")
        if not file_path.exists():
            return UploadOutcome(
                success=False,
                retry_after_seconds=300.0,
                message=f"file missing: {file_path}",
            )

        mime_type = item.mime_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        data = {"metadata": json.dumps(payload)}
        self.logger.info(
            "Uploading %s queue item %s to %s from %s",
            item.kind,
            item.id,
            endpoint,
            file_path,
        )

        with file_path.open("rb") as handle:
            try:
                response = requests.post(
                    endpoint,
                    headers=headers,
                    data=data,
                    files={"file": (file_path.name, handle, mime_type)},
                    timeout=self.config.upload.timeout_seconds,
                    verify=self.config.upload.verify_tls,
                )
            except requests.RequestException as exc:
                return UploadOutcome(
                    success=False,
                    retry_after_seconds=60.0,
                    message=f"network error: {exc}",
                )
        return self._response_to_outcome(response)

    def _upload_metadata(
        self,
        item: QueueUploadItem,
        endpoint: str,
        headers: dict[str, str],
        payload: dict[str, object],
    ) -> UploadOutcome:
        json_headers = {**headers, "Content-Type": "application/json"}
        self.logger.info(
            "Uploading metadata event %s for session %s to %s",
            item.metadata.get("event_type", item.kind),
            item.session_id,
            endpoint,
        )
        try:
            response = requests.post(
                endpoint,
                headers=json_headers,
                json=payload,
                timeout=self.config.upload.timeout_seconds,
                verify=self.config.upload.verify_tls,
            )
        except requests.RequestException as exc:
            return UploadOutcome(
                success=False,
                retry_after_seconds=60.0,
                message=f"network error: {exc}",
            )
        return self._response_to_outcome(response)

    def _response_to_outcome(self, response: "requests.Response") -> UploadOutcome:
        if 200 <= response.status_code < 300:
            self.logger.info("Upload succeeded with status %s", response.status_code)
            return UploadOutcome(success=True, message=f"http {response.status_code}")

        retry_after = 60.0
        retry_after_header = response.headers.get("Retry-After")
        if retry_after_header and retry_after_header.isdigit():
            retry_after = float(retry_after_header)

        if response.status_code == 429 or response.status_code >= 500:
            return UploadOutcome(
                success=False,
                retry_after_seconds=retry_after,
                message=f"retryable http error {response.status_code}: {response.text[:200]}",
            )

        return UploadOutcome(
            success=False,
            retry_after_seconds=max(retry_after, 600.0),
            message=f"http error {response.status_code}: {response.text[:200]}",
        )

    def _cleanup_uploaded_file(self, item: QueueUploadItem) -> None:
        if self.config.upload.keep_uploaded_files or not item.file_path:
            return
        file_path = Path(item.file_path)
        if not file_path.exists():
            return
        file_path.unlink(missing_ok=True)
        self.logger.debug("Removed uploaded local file %s", file_path)

    def _resolve_endpoint(self, item: QueueUploadItem) -> str:
        if item.kind == "audio":
            return self.config.upload.upload_audio_url
        if item.kind == "image":
            return self.config.upload.upload_image_url
        if item.kind == "session_event":
            event_type = str(item.metadata.get("event_type", ""))
            if event_type == "session_started":
                return self.config.upload.session_start_url
            if event_type == "session_stopped":
                return self.config.upload.session_end_url
            if event_type == "heartbeat":
                return self.config.upload.heartbeat_url
            raise ValueError(f"unsupported session event type: {event_type}")
        raise ValueError(f"unsupported upload kind: {item.kind}")

    def _build_payload(self, item: QueueUploadItem) -> dict[str, object]:
        if item.kind == "audio":
            return {
                "sessionId": item.session_id,
                "audioChunk": {
                    "id": item.metadata.get("audio_chunk_id"),
                    "sessionId": item.session_id,
                    "sequenceNumber": item.metadata.get("sequence_number", 0),
                    "capturedAt": item.metadata.get("timestamp") or item.captured_at,
                    "durationMs": item.metadata.get("duration_ms", 0),
                    "sampleRateHz": item.metadata.get("sample_rate_hz", 16000),
                    "channels": item.metadata.get("channels", 1),
                    "uploadStatus": "uploaded",
                    "localPath": item.file_path,
                    "checksumSha256": item.metadata.get("checksum_sha256"),
                },
                "artifact": {
                    "contentType": item.mime_type,
                    "originalFileName": Path(item.file_path).name if item.file_path else None,
                    "fileSizeBytes": item.metadata.get("file_size_bytes"),
                },
            }

        if item.kind == "image":
            return {
                "sessionId": item.session_id,
                "capturedImage": {
                    "id": item.metadata.get("image_id"),
                    "sessionId": item.session_id,
                    "sequenceNumber": item.metadata.get("sequence_number", 0),
                    "capturedAt": item.metadata.get("timestamp") or item.captured_at,
                    "acceptedForProcessing": bool(
                        item.metadata.get("accepted_for_processing", True),
                    ),
                    "localPath": item.file_path,
                    "diffScore": item.metadata.get("diff_score"),
                    "blurScore": item.metadata.get("blur_score"),
                    "qualityScore": item.metadata.get("quality_score"),
                    "uncertaintyFlags": [],
                },
                "artifact": {
                    "contentType": item.mime_type,
                    "originalFileName": Path(item.file_path).name if item.file_path else None,
                    "fileSizeBytes": item.metadata.get("file_size_bytes"),
                },
            }

        event_type = str(item.metadata.get("event_type", ""))
        if event_type == "session_started":
            return {
                "title": item.metadata.get("session_title") or "Class Session",
                "deviceId": item.metadata.get("device_id") or self.config.device_id,
                "startedAt": item.metadata.get("started_at") or item.captured_at or item.created_at,
                "classroomLabel": item.metadata.get("classroom_label"),
                "clientSessionId": item.session_id,
            }
        if event_type == "session_stopped":
            return {
                "sessionId": item.session_id,
                "endedAt": item.metadata.get("ended_at") or item.captured_at or item.created_at,
                "stopReason": item.metadata.get("stop_reason"),
                "lastAudioSequenceNumber": item.metadata.get("last_audio_sequence_number"),
                "lastImageSequenceNumber": item.metadata.get("last_image_sequence_number"),
            }
        if event_type == "heartbeat":
            return {
                "sessionId": item.session_id,
                "observedAt": item.metadata.get("timestamp") or item.captured_at or item.created_at,
                "queuedUploadCount": item.metadata.get("queued_upload_count"),
                "lastAudioSequenceNumber": item.metadata.get("last_audio_sequence_number"),
                "lastImageSequenceNumber": item.metadata.get("last_image_sequence_number"),
                "runtimeStatus": item.metadata.get("runtime_status"),
            }

        raise ValueError(f"unsupported session event type: {event_type}")
