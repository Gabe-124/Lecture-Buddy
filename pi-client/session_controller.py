from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from audio_capture import AudioCapture, AudioCaptureResult
from camera_capture import CameraCapture, ImageCaptureResult
from config import PiClientConfig
from control_client import ControlClient
from local_queue import FileBackedQueue, QueueUploadItem
from uploader import CloudUploader
from network import get_local_ip_address


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(slots=True)
class SessionState:
    session_id: str
    title: str
    device_id: str
    started_at: str
    status: str
    classroom_label: str | None = None
    ended_at: str | None = None
    stop_reason: str | None = None
    audio_sequence_number: int = 0
    image_sequence_number: int = 0
    last_audio_captured_at: str | None = None
    last_image_saved_at: str | None = None
    last_saved_image_path: str | None = None
    device_ip_address: str | None = None


class SessionStateStore:
    def __init__(
        self,
        state_file: Path,
        sessions_dir: Path,
        logger: logging.Logger | None = None,
    ) -> None:
        self.state_file = state_file
        self.sessions_dir = sessions_dir
        self.logger = logger or logging.getLogger(__name__)

    def load(self) -> SessionState | None:
        if not self.state_file.exists():
            return None
        raw_text = self.state_file.read_text(encoding="utf-8").strip()
        if not raw_text:
            return None
        raw_state = json.loads(raw_text)
        return SessionState(**raw_state)

    def save(self, state: SessionState) -> None:
        self.state_file.write_text(
            json.dumps(asdict(state), indent=2),
            encoding="utf-8",
        )
        self._write_archive(state)

    def clear(self) -> None:
        self.state_file.unlink(missing_ok=True)

    def _write_archive(self, state: SessionState) -> None:
        session_path = self.sessions_dir / f"{state.session_id}.json"
        session_path.write_text(json.dumps(asdict(state), indent=2), encoding="utf-8")


@dataclass(slots=True)
class SessionSnapshot:
    active_session: SessionState | None
    queued_uploads: int
    runtime_status: str


@dataclass(slots=True)
class SessionController:
    config: PiClientConfig
    logger: logging.Logger = field(
        default_factory=lambda: logging.getLogger(__name__),
        repr=False,
    )
    queue: FileBackedQueue = field(init=False)
    uploader: CloudUploader = field(init=False)
    audio_capture: AudioCapture = field(init=False)
    camera_capture: CameraCapture = field(init=False)
    state_store: SessionStateStore = field(init=False)
    session_state: SessionState | None = field(default=None, init=False)
    _stop_requested: bool = field(default=False, init=False)
    _restart_requested: bool = field(default=False, init=False)
    _last_heartbeat_enqueued_at: float = field(default=0.0, init=False)
    control_client: ControlClient = field(init=False)
    _last_control_command_id: str | None = field(default=None, init=False)
    _last_control_command_status: str | None = field(default=None, init=False)

    def __post_init__(self) -> None:
        self.queue = FileBackedQueue(self.config.paths.queue_file, logger=self.logger)
        self.uploader = CloudUploader(config=self.config, queue=self.queue, logger=self.logger)
        self.audio_capture = AudioCapture(config=self.config, logger=self.logger)
        self.camera_capture = CameraCapture(config=self.config, logger=self.logger)
        self.control_client = ControlClient(config=self.config, logger=self.logger)
        self.state_store = SessionStateStore(
            self.config.paths.session_state_file,
            self.config.paths.sessions_dir,
            logger=self.logger,
        )
        self._load_control_state()
        self.session_state = self.state_store.load()
        if self.session_state is not None:
            self.logger.info(
                "Loaded existing session state %s (%s)",
                self.session_state.session_id,
                self.session_state.status,
            )
            self._sync_capture_state()

    def run_forever(self, *, session_title: str, max_cycles: int | None = None) -> None:
        self.ensure_session_started(session_title=session_title)
        cycles = 0
        while not self._stop_requested:
            self._poll_and_apply_control_command(session_title=session_title)

            if self.session_state is None:
                self.uploader.flush_ready()
                time.sleep(self.config.heartbeat_seconds)
                continue

            self.run_cycle()
            cycles += 1
            if max_cycles is not None and cycles >= max_cycles:
                self.logger.info("Reached max cycle count of %s; stopping.", max_cycles)
                break
            time.sleep(self.config.heartbeat_seconds)
        if self.session_state is not None:
            self.stop_session(reason="graceful-stop")

    def run_once(self, *, session_title: str, stop_after_cycle: bool = True) -> None:
        self.ensure_session_started(session_title=session_title)
        self.run_cycle()
        if stop_after_cycle:
            self.stop_session(reason="single-cycle-complete")

    def run_cycle(self) -> None:
        if self.session_state is None:
            raise RuntimeError("Session must be started before running a cycle.")

        audio_result = self.audio_capture.record_chunk(self.session_state.session_id)
        if audio_result is not None:
            self._handle_audio_result(audio_result)

        image_result = self.camera_capture.maybe_capture_image(
            self.session_state.session_id,
            transcript_cues=None,
        )
        if image_result is not None:
            self._handle_image_result(image_result)

        self._maybe_enqueue_heartbeat()
        uploaded_count = self.uploader.flush_ready()
        if uploaded_count:
            self.logger.info("Uploaded %s queued items this cycle.", uploaded_count)

    def ensure_session_started(self, *, session_title: str) -> SessionState:
        if self.session_state is not None and self.session_state.status == "running":
            return self.session_state

        if self.session_state is not None and self.session_state.status != "running":
            self.logger.info(
                "Discarding inactive session state %s with status %s before starting a new session.",
                self.session_state.session_id,
                self.session_state.status,
            )

        session_id = f"session_{uuid.uuid4().hex[:12]}"
        self.session_state = SessionState(
            session_id=session_id,
            title=session_title,
            device_id=self.config.device_id,
            classroom_label=self.config.classroom_label,
            started_at=utc_now(),
            status="running",
                device_ip_address=get_local_ip_address(),
        )
        self._sync_capture_state()
        self.state_store.save(self.session_state)
        self._enqueue_session_event("session_started", self.session_state.started_at)
        self.logger.info("Started new session %s (%s)", session_id, session_title)
        return self.session_state

    def stop_session(self, *, reason: str) -> None:
        if self.session_state is None:
            self.logger.info("No active session to stop.")
            return

        if self.session_state.status == "stopped":
            self.logger.info("Session %s is already stopped.", self.session_state.session_id)
            return

        self.session_state.status = "stopped"
        self.session_state.ended_at = utc_now()
        self.session_state.stop_reason = reason
        self.state_store.save(self.session_state)
        self._enqueue_session_event("session_stopped", self.session_state.ended_at)
        self.uploader.flush_ready()
        self.logger.info(
            "Stopped session %s (%s)",
            self.session_state.session_id,
            reason,
        )
        self.state_store.clear()
        self.session_state = None

    def request_stop(self, reason: str) -> None:
        self.logger.info("Stop requested: %s", reason)
        self._stop_requested = True

    def flush_queue(self) -> int:
        return self.uploader.flush_ready()

    def snapshot(self) -> SessionSnapshot:
        if self._stop_requested:
            runtime_status = "stopping"
        elif self.session_state is None:
            runtime_status = "idle"
        else:
            runtime_status = self.session_state.status
        return SessionSnapshot(
            active_session=self.session_state,
            queued_uploads=self.queue.size(),
            runtime_status=runtime_status,
        )

    def _handle_audio_result(self, audio_result: AudioCaptureResult) -> None:
        if self.session_state is None or not audio_result.chunk.local_path:
            return

        self.session_state.audio_sequence_number = audio_result.chunk.sequence_number
        self.session_state.last_audio_captured_at = audio_result.chunk.captured_at
        self.state_store.save(self.session_state)
        self.queue.enqueue(
            QueueUploadItem(
                kind="audio",
                session_id=self.session_state.session_id,
                captured_at=audio_result.chunk.captured_at,
                file_path=audio_result.chunk.local_path,
                mime_type="audio/wav",
                metadata={
                    "audio_chunk_id": audio_result.chunk.id,
                    "sequence_number": audio_result.chunk.sequence_number,
                    "timestamp": audio_result.chunk.captured_at,
                    "duration_ms": audio_result.chunk.duration_ms,
                    "sample_rate_hz": audio_result.chunk.sample_rate_hz,
                    "channels": audio_result.chunk.channels,
                    "session_title": self.session_state.title,
                    "file_size_bytes": audio_result.file_size_bytes,
                },
            )
        )

    def _handle_image_result(self, image_result: ImageCaptureResult) -> None:
        if self.session_state is None or not image_result.image.local_path:
            return

        decision = image_result.decision
        self.session_state.image_sequence_number = image_result.image.sequence_number
        self.session_state.last_image_saved_at = image_result.image.captured_at
        self.session_state.last_saved_image_path = image_result.image.local_path
        self.state_store.save(self.session_state)
        self.queue.enqueue(
            QueueUploadItem(
                kind="image",
                session_id=self.session_state.session_id,
                captured_at=image_result.image.captured_at,
                file_path=image_result.image.local_path,
                mime_type="image/jpeg",
                metadata={
                    "image_id": image_result.image.id,
                    "sequence_number": image_result.image.sequence_number,
                    "timestamp": image_result.image.captured_at,
                    "accepted_for_processing": image_result.image.accepted_for_processing,
                    "diff_score": decision.diff_score,
                    "blur_score": decision.blur_score,
                    "quality_score": decision.quality_score,
                    "worthiness_reason": decision.reason,
                    "cue_matches": list(decision.metrics.cue_matches),
                    "session_title": self.session_state.title,
                    "file_size_bytes": image_result.file_size_bytes,
                },
            )
        )

    def _enqueue_session_event(self, event_type: str, timestamp: str | None) -> None:
        if self.session_state is None:
            return
        self.queue.enqueue(
            QueueUploadItem(
                kind="session_event",
                session_id=self.session_state.session_id,
                captured_at=timestamp,
                metadata={
                    "event_type": event_type,
                    "timestamp": timestamp,
                    "session_title": self.session_state.title,
                    "started_at": self.session_state.started_at,
                    "ended_at": self.session_state.ended_at,
                    "device_id": self.session_state.device_id,
                    "classroom_label": self.session_state.classroom_label,
                    "stop_reason": self.session_state.stop_reason,
                    "last_audio_sequence_number": self.session_state.audio_sequence_number,
                    "last_image_sequence_number": self.session_state.image_sequence_number,
                    "device_ip_address": self.session_state.device_ip_address,
                },
            )
        )

    def _sync_capture_state(self) -> None:
        sequence_number = self.session_state.audio_sequence_number if self.session_state else 0
        self.audio_capture.sync_state(sequence_number)

        self.camera_capture.sync_state(
            sequence_number=self.session_state.image_sequence_number if self.session_state else 0,
            last_saved_at=self.session_state.last_image_saved_at if self.session_state else None,
            last_saved_image_path=self.session_state.last_saved_image_path if self.session_state else None,
        )

    def _maybe_enqueue_heartbeat(self) -> None:
        if self.session_state is None:
            return

        now = time.monotonic()
        if now - self._last_heartbeat_enqueued_at < self.config.heartbeat_seconds:
            return

        current_ip = get_local_ip_address()
        if self.session_state.device_ip_address != current_ip:
            self.session_state.device_ip_address = current_ip
            self.state_store.save(self.session_state)

        timestamp = utc_now()
        self.queue.enqueue(
            QueueUploadItem(
                kind="session_event",
                session_id=self.session_state.session_id,
                captured_at=timestamp,
                metadata={
                    "event_type": "heartbeat",
                    "timestamp": timestamp,
                    "device_id": self.session_state.device_id,
                    "classroom_label": self.session_state.classroom_label,
                    "queued_upload_count": self.queue.size(),
                    "last_audio_sequence_number": self.session_state.audio_sequence_number,
                    "last_image_sequence_number": self.session_state.image_sequence_number,
                    "runtime_status": self.session_state.status,
                    "device_ip_address": self.session_state.device_ip_address,
                },
            )
        )
        self._last_heartbeat_enqueued_at = now

    @property
    def restart_requested(self) -> bool:
        return self._restart_requested

    def _poll_and_apply_control_command(self, *, session_title: str) -> None:
        runtime_status = self.snapshot().runtime_status
        command = self.control_client.poll_next_command(
            runtime_status=runtime_status,
            active_session_id=self.session_state.session_id if self.session_state else None,
            device_ip_address=(
                self.session_state.device_ip_address
                if self.session_state
                else get_local_ip_address()
            ),
        )
        if command is None:
            return

        command_id = str(command.get("commandId", ""))
        command_type = str(command.get("commandType", ""))
        if not command_id or not command_type:
            return

        if command_id == self._last_control_command_id and self._last_control_command_status:
            self.control_client.acknowledge_command(
                command_id=command_id,
                status=self._last_control_command_status,
            )
            return

        self.logger.info("Applying control command %s (%s)", command_id, command_type)
        try:
            if command_type == "start_session":
                if self.session_state is None:
                    self.ensure_session_started(session_title=session_title)
                self._save_control_state(command_id, "applied")
                self.control_client.acknowledge_command(command_id=command_id, status="applied")
                return

            if command_type == "stop_session":
                if self.session_state is not None:
                    self.stop_session(reason="remote-stop-command")
                self._save_control_state(command_id, "applied")
                self.control_client.acknowledge_command(command_id=command_id, status="applied")
                return

            if command_type == "restart_service":
                if self.session_state is not None:
                    self.stop_session(reason="remote-restart-command")
                self._save_control_state(command_id, "applied")
                self.control_client.acknowledge_command(command_id=command_id, status="applied")
                self._restart_requested = True
                self._stop_requested = True
                return

            raise RuntimeError(f"unsupported control command type: {command_type}")
        except Exception as exc:
            self.logger.exception("Failed to apply control command %s: %s", command_id, exc)
            self._save_control_state(command_id, "failed")
            self.control_client.acknowledge_command(
                command_id=command_id,
                status="failed",
                error_message=str(exc),
            )

    def _load_control_state(self) -> None:
        path = self.config.paths.control_state_file
        if not path.exists():
            return
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            self._last_control_command_id = str(raw.get("last_command_id")) if raw.get("last_command_id") else None
            self._last_control_command_status = str(raw.get("last_command_status")) if raw.get("last_command_status") else None
        except Exception:
            self.logger.warning("Unable to read control state file at %s", path)

    def _save_control_state(self, command_id: str, status: str) -> None:
        self._last_control_command_id = command_id
        self._last_control_command_status = status
        try:
            self.config.paths.control_state_file.write_text(
                json.dumps(
                    {
                        "last_command_id": command_id,
                        "last_command_status": status,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception:
            self.logger.warning("Unable to persist control state file at %s", self.config.paths.control_state_file)
