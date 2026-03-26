from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

try:
    import sounddevice as sd
except ImportError:  # pragma: no cover - validated in health checks
    sd = None  # type: ignore[assignment]

try:
    import soundfile as sf
except ImportError:  # pragma: no cover - validated in health checks
    sf = None  # type: ignore[assignment]

from shared.models import AudioChunk

from config import PiClientConfig


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(slots=True)
class AudioCaptureResult:
    chunk: AudioChunk
    file_size_bytes: int


@dataclass(slots=True)
class AudioCapture:
    config: PiClientConfig
    logger: logging.Logger = field(
        default_factory=lambda: logging.getLogger(__name__),
        repr=False,
    )
    sequence_number: int = field(default=0, init=False)

    def sync_state(self, sequence_number: int) -> None:
        self.sequence_number = sequence_number

    def record_chunk(self, session_id: str) -> AudioCaptureResult | None:
        """Record one raw audio chunk for later cloud-side processing."""
        if sd is None or sf is None:
            self.logger.error(
                "Audio capture dependencies are unavailable. Install requirements before recording."
            )
            return None

        frames = int(self.config.audio.sample_rate_hz * self.config.audio.chunk_seconds)
        if frames <= 0:
            self.logger.warning("Skipping audio capture because chunk size is not positive.")
            return None

        next_sequence = self.sequence_number + 1
        captured_at = utc_now()
        target_path = self._build_audio_path(
            session_id=session_id,
            sequence_number=next_sequence,
            captured_at=captured_at,
        )

        self.logger.info(
            "Recording audio chunk %s for session %s (%ss)",
            next_sequence,
            session_id,
            self.config.audio.chunk_seconds,
        )

        try:
            recording = sd.rec(
                frames,
                samplerate=self.config.audio.sample_rate_hz,
                channels=self.config.audio.channels,
                dtype="int16",
                device=self.config.audio.input_device,
            )
            sd.wait()
            sf.write(
                target_path,
                recording,
                self.config.audio.sample_rate_hz,
                subtype="PCM_16",
            )
        except Exception as exc:  # pragma: no cover - depends on hardware
            self.logger.exception("Audio capture failed: %s", exc)
            if target_path.exists():
                target_path.unlink(missing_ok=True)
            return None

        self.sequence_number = next_sequence
        chunk = AudioChunk(
            id=f"audio_{uuid.uuid4().hex[:12]}",
            session_id=session_id,
            sequence_number=self.sequence_number,
            captured_at=captured_at,
            duration_ms=int(self.config.audio.chunk_seconds * 1000),
            sample_rate_hz=self.config.audio.sample_rate_hz,
            channels=self.config.audio.channels,
            local_path=str(target_path),
        )
        self.logger.info("Saved audio chunk %s to %s", chunk.id, target_path)
        return AudioCaptureResult(chunk=chunk, file_size_bytes=target_path.stat().st_size)

    def _build_audio_path(
        self,
        *,
        session_id: str,
        sequence_number: int,
        captured_at: str,
    ) -> Path:
        safe_timestamp = captured_at.replace(":", "-")
        filename = f"{session_id}_audio_{sequence_number:05d}_{safe_timestamp}.wav"
        return self.config.paths.audio_dir / filename
