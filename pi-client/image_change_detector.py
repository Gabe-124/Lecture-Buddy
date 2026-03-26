from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Sequence

try:
    import cv2
except ImportError:  # pragma: no cover - validated in health checks
    cv2 = None  # type: ignore[assignment]

try:
    import numpy as np
except ImportError:  # pragma: no cover - validated in health checks
    np = None  # type: ignore[assignment]

if TYPE_CHECKING:
    import numpy.typing as npt


@dataclass(slots=True)
class ImageMetrics:
    elapsed_seconds: float | None
    diff_score: float
    blur_score: float
    brightness_mean: float
    contrast_score: float
    quality_score: float
    cue_bonus: float
    cue_matches: tuple[str, ...]


@dataclass(slots=True)
class ImageDecision:
    is_worth_saving: bool
    reason: str
    metrics: ImageMetrics

    @property
    def diff_score(self) -> float:
        return self.metrics.diff_score

    @property
    def blur_score(self) -> float:
        return self.metrics.blur_score

    @property
    def quality_score(self) -> float:
        return self.metrics.quality_score


@dataclass(slots=True)
class ImageChangeDetector:
    min_diff_score: float
    min_blur_score: float
    min_quality_score: float
    cue_phrases: tuple[str, ...] = ()
    logger: logging.Logger = field(
        default_factory=lambda: logging.getLogger(__name__),
        repr=False,
    )
    _previous_saved_gray_small: "npt.NDArray[np.uint8] | None" = field(
        default=None,
        init=False,
        repr=False,
    )

    def evaluate(
        self,
        frame: "npt.NDArray[np.uint8]",
        *,
        elapsed_seconds: float | None,
        transcript_cues: Sequence[str] | None = None,
    ) -> ImageDecision:
        if cv2 is None or np is None:
            return ImageDecision(
                is_worth_saving=False,
                reason="opencv-not-installed",
                metrics=ImageMetrics(
                    elapsed_seconds=elapsed_seconds,
                    diff_score=0.0,
                    blur_score=0.0,
                    brightness_mean=0.0,
                    contrast_score=0.0,
                    quality_score=0.0,
                    cue_bonus=0.0,
                    cue_matches=(),
                ),
            )

        if elapsed_seconds is not None and elapsed_seconds <= 0:
            return ImageDecision(
                is_worth_saving=False,
                reason="capture-interval-not-met",
                metrics=ImageMetrics(
                    elapsed_seconds=elapsed_seconds,
                    diff_score=0.0,
                    blur_score=0.0,
                    brightness_mean=0.0,
                    contrast_score=0.0,
                    quality_score=0.0,
                    cue_bonus=0.0,
                    cue_matches=(),
                ),
            )

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness_mean = float(gray.mean())
        contrast_score = float(gray.std())
        quality_score = self._quality_score(
            blur_score=blur_score,
            brightness_mean=brightness_mean,
            contrast_score=contrast_score,
        )
        diff_score = self._diff_score(gray)
        cue_matches = self._cue_matches(transcript_cues)
        cue_bonus = 0.15 if cue_matches else 0.0

        metrics = ImageMetrics(
            elapsed_seconds=elapsed_seconds,
            diff_score=diff_score,
            blur_score=blur_score,
            brightness_mean=brightness_mean,
            contrast_score=contrast_score,
            quality_score=quality_score,
            cue_bonus=cue_bonus,
            cue_matches=cue_matches,
        )

        if blur_score < self.min_blur_score:
            return ImageDecision(False, "frame-too-blurry", metrics)

        if quality_score < self.min_quality_score:
            return ImageDecision(False, "frame-quality-too-low", metrics)

        if self._previous_saved_gray_small is None:
            return ImageDecision(True, "first-worthy-frame", metrics)

        diff_threshold = max(0.01, self.min_diff_score - cue_bonus)
        if diff_score >= diff_threshold:
            return ImageDecision(True, "meaningful-visual-change", metrics)

        if cue_matches and diff_score >= diff_threshold * 0.75:
            return ImageDecision(True, "cue-assisted-capture", metrics)

        return ImageDecision(False, "visual-change-below-threshold", metrics)

    def commit_saved_frame(self, frame: "npt.NDArray[np.uint8]") -> None:
        if cv2 is None:
            return
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        self._previous_saved_gray_small = self._resize_for_diff(gray)

    def seed_from_path(self, image_path: Path) -> None:
        if cv2 is None or not image_path.exists():
            return
        frame = cv2.imread(str(image_path))
        if frame is None:
            self.logger.warning("Unable to seed detector from %s", image_path)
            return
        self.commit_saved_frame(frame)

    def _diff_score(self, gray_frame: "npt.NDArray[np.uint8]") -> float:
        current_small = self._resize_for_diff(gray_frame)
        if self._previous_saved_gray_small is None:
            return 1.0
        absolute_diff = cv2.absdiff(current_small, self._previous_saved_gray_small)
        return float(absolute_diff.mean() / 255.0)

    def _resize_for_diff(
        self,
        gray_frame: "npt.NDArray[np.uint8]",
    ) -> "npt.NDArray[np.uint8]":
        return cv2.resize(gray_frame, (160, 90), interpolation=cv2.INTER_AREA)

    def _quality_score(
        self,
        *,
        blur_score: float,
        brightness_mean: float,
        contrast_score: float,
    ) -> float:
        blur_component = min(1.0, blur_score / max(self.min_blur_score * 2.0, 1.0))
        exposure_component = max(0.0, 1.0 - (abs(brightness_mean - 128.0) / 128.0))
        contrast_component = min(1.0, contrast_score / 64.0)
        return (0.5 * blur_component) + (0.3 * exposure_component) + (0.2 * contrast_component)

    def _cue_matches(self, transcript_cues: Sequence[str] | None) -> tuple[str, ...]:
        if not transcript_cues:
            return ()

        normalized_text = " ".join(item.lower() for item in transcript_cues)
        matches = [phrase for phrase in self.cue_phrases if phrase.lower() in normalized_text]
        return tuple(matches)
