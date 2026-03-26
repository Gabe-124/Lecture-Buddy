from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Sequence

try:
    import cv2
except ImportError:  # pragma: no cover - validated in health checks
    cv2 = None  # type: ignore[assignment]

from shared.models import CapturedImage

from config import PiClientConfig
from image_change_detector import ImageChangeDetector, ImageDecision

if TYPE_CHECKING:
    import numpy.typing as npt


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(slots=True)
class ImageCaptureResult:
    image: CapturedImage
    decision: ImageDecision
    file_size_bytes: int


@dataclass(slots=True)
class CameraCapture:
    config: PiClientConfig
    logger: logging.Logger = field(
        default_factory=lambda: logging.getLogger(__name__),
        repr=False,
    )
    detector: ImageChangeDetector = field(init=False)
    sequence_number: int = field(default=0, init=False)
    _last_saved_at: str | None = field(default=None, init=False)
    _last_saved_path: Path | None = field(default=None, init=False)

    def __post_init__(self) -> None:
        self.detector = ImageChangeDetector(
            min_diff_score=self.config.camera.min_diff_score,
            min_blur_score=self.config.camera.min_blur_score,
            min_quality_score=self.config.camera.min_quality_score,
            cue_phrases=self.config.transcript_cue_phrases,
            logger=self.logger,
        )

    def sync_state(
        self,
        *,
        sequence_number: int,
        last_saved_at: str | None,
        last_saved_image_path: str | None,
    ) -> None:
        self.sequence_number = sequence_number
        self._last_saved_at = last_saved_at
        self._last_saved_path = Path(last_saved_image_path) if last_saved_image_path else None
        if self._last_saved_path is not None:
            self.detector.seed_from_path(self._last_saved_path)

    def maybe_capture_image(
        self,
        session_id: str,
        *,
        transcript_cues: Sequence[str] | None = None,
    ) -> ImageCaptureResult | None:
        elapsed_seconds = self._elapsed_since_last_saved()
        if (
            elapsed_seconds is not None
            and elapsed_seconds < self.config.camera.capture_interval_seconds
        ):
            self.logger.debug(
                "Skipping image capture for session %s; %.1fs since last saved image.",
                session_id,
                elapsed_seconds,
            )
            return None

        frame = self._capture_frame()
        if frame is None:
            return None

        decision = self.detector.evaluate(
            frame,
            elapsed_seconds=elapsed_seconds,
            transcript_cues=transcript_cues,
        )
        if not decision.is_worth_saving:
            self.logger.info(
                "Discarded webcam frame for session %s (%s, diff=%.3f, blur=%.2f, quality=%.2f)",
                session_id,
                decision.reason,
                decision.diff_score,
                decision.blur_score,
                decision.quality_score,
            )
            return None

        captured_at = utc_now()
        next_sequence = self.sequence_number + 1
        target_path = self._build_image_path(
            session_id=session_id,
            sequence_number=next_sequence,
            captured_at=captured_at,
        )

        if not self._save_frame(frame, target_path):
            return None

        self.detector.commit_saved_frame(frame)
        self.sequence_number = next_sequence
        self._last_saved_at = captured_at
        self._last_saved_path = target_path

        image = CapturedImage(
            id=f"image_{uuid.uuid4().hex[:12]}",
            session_id=session_id,
            sequence_number=self.sequence_number,
            captured_at=captured_at,
            local_path=str(target_path),
            diff_score=decision.diff_score,
        )
        self.logger.info(
            "Saved image %s to %s (diff=%.3f, blur=%.2f, quality=%.2f)",
            image.id,
            target_path,
            decision.diff_score,
            decision.blur_score,
            decision.quality_score,
        )
        return ImageCaptureResult(
            image=image,
            decision=decision,
            file_size_bytes=target_path.stat().st_size,
        )

    def _capture_frame(self) -> "npt.NDArray[object] | None":
        if cv2 is None:
            self.logger.error(
                "OpenCV is unavailable. Install requirements before capturing webcam frames."
            )
            return None

        capture = cv2.VideoCapture(self.config.camera.device_index)
        if not capture.isOpened():
            self.logger.warning(
                "Unable to open camera device %s", self.config.camera.device_index
            )
            capture.release()
            return None

        capture.set(cv2.CAP_PROP_FRAME_WIDTH, float(self.config.camera.frame_width))
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, float(self.config.camera.frame_height))

        try:
            time.sleep(self.config.camera.warmup_seconds)
            ok, frame = capture.read()
        finally:
            capture.release()

        if not ok or frame is None:
            self.logger.warning("Camera read failed.")
            return None
        return frame

    def _save_frame(self, frame: "npt.NDArray[object]", target_path: Path) -> bool:
        if cv2 is None:
            return False

        try:
            ok = cv2.imwrite(
                str(target_path),
                frame,
                [cv2.IMWRITE_JPEG_QUALITY, self.config.camera.jpeg_quality],
            )
        except Exception as exc:  # pragma: no cover - depends on filesystem/cv2
            self.logger.exception("Failed to save frame to %s: %s", target_path, exc)
            return False
        if not ok:
            self.logger.error("cv2.imwrite returned false for %s", target_path)
            return False
        return True

    def _elapsed_since_last_saved(self) -> float | None:
        if self._last_saved_at is None:
            return None
        try:
            last_saved = datetime.fromisoformat(self._last_saved_at)
        except ValueError:
            self.logger.warning("Invalid last image timestamp in session state: %s", self._last_saved_at)
            return None
        if last_saved.tzinfo is None:
            last_saved = last_saved.replace(tzinfo=UTC)
        return (datetime.now(UTC) - last_saved.astimezone(UTC)).total_seconds()

    def _build_image_path(
        self,
        *,
        session_id: str,
        sequence_number: int,
        captured_at: str,
    ) -> Path:
        safe_timestamp = captured_at.replace(":", "-")
        filename = f"{session_id}_image_{sequence_number:05d}_{safe_timestamp}.jpg"
        return self.config.paths.image_dir / filename

    @property
    def last_saved_image_path(self) -> str | None:
        return str(self._last_saved_path) if self._last_saved_path is not None else None

    @property
    def last_saved_at(self) -> str | None:
        return self._last_saved_at
