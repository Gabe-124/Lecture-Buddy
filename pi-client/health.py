from __future__ import annotations

import importlib.util
from dataclasses import dataclass, field
from pathlib import Path

from config import PiClientConfig


@dataclass(slots=True)
class HealthReport:
    ok: bool
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def run_startup_checks(config: PiClientConfig) -> HealthReport:
    issues: list[str] = []
    warnings: list[str] = []

    _check_directories(config, issues)
    _check_numeric_config(config, issues)
    _check_python_packages(issues)
    _check_upload_config(config, warnings)
    _check_audio_device(config, issues, warnings)
    _check_camera_device(config, issues, warnings)

    return HealthReport(ok=not issues, issues=issues, warnings=warnings)


def _check_directories(config: PiClientConfig, issues: list[str]) -> None:
    required_paths = [
        config.paths.data_dir,
        config.paths.cache_dir,
        config.paths.logs_dir,
        config.paths.queue_dir,
        config.paths.audio_dir,
        config.paths.image_dir,
        config.paths.sessions_dir,
        config.paths.queue_file.parent,
    ]
    for path in required_paths:
        if not path.exists():
            issues.append(f"required path missing: {path}")
        elif not _is_writable(path):
            issues.append(f"path is not writable: {path}")


def _check_numeric_config(config: PiClientConfig, issues: list[str]) -> None:
    if config.audio.chunk_seconds <= 0:
        issues.append("AUDIO_CHUNK_SECONDS must be positive")
    if config.audio.sample_rate_hz <= 0:
        issues.append("AUDIO_SAMPLE_RATE_HZ must be positive")
    if config.audio.channels <= 0:
        issues.append("AUDIO_CHANNELS must be positive")
    if config.camera.capture_interval_seconds <= 0:
        issues.append("IMAGE_CAPTURE_INTERVAL_SECONDS must be positive")
    if not 0.0 <= config.camera.min_diff_score <= 1.0:
        issues.append("IMAGE_MIN_DIFF_SCORE must be between 0 and 1")
    if config.camera.min_blur_score <= 0:
        issues.append("IMAGE_MIN_BLUR_SCORE must be positive")
    if not 0.0 <= config.camera.min_quality_score <= 1.0:
        issues.append("IMAGE_MIN_QUALITY_SCORE must be between 0 and 1")
    if not 1 <= config.camera.jpeg_quality <= 100:
        issues.append("IMAGE_JPEG_QUALITY must be between 1 and 100")
    if config.upload.timeout_seconds <= 0:
        issues.append("UPLOAD_TIMEOUT_SECONDS must be positive")
    if config.upload.batch_size <= 0:
        issues.append("UPLOAD_BATCH_SIZE must be positive")


def _check_python_packages(issues: list[str]) -> None:
    required_modules = {
        "cv2": "opencv-python-headless",
        "numpy": "numpy",
        "requests": "requests",
        "sounddevice": "sounddevice",
        "soundfile": "soundfile",
    }
    for module_name, package_name in required_modules.items():
        if importlib.util.find_spec(module_name) is None:
            issues.append(f"missing Python package '{package_name}' for module '{module_name}'")


def _check_upload_config(config: PiClientConfig, warnings: list[str]) -> None:
    if not config.upload.cloud_api_base_url.startswith("http"):
        warnings.append("CLOUD_API_BASE_URL does not look like an http(s) endpoint")
    if "example.com" in config.upload.cloud_api_base_url:
        warnings.append("CLOUD_API_BASE_URL is still pointing at the example placeholder")
    if config.upload.legacy_ingest_url:
        warnings.append(
            "UPLOAD_INGEST_URL is deprecated; prefer CLOUD_API_BASE_URL with the /api/v1/* routes",
        )


def _check_audio_device(
    config: PiClientConfig,
    issues: list[str],
    warnings: list[str],
) -> None:
    spec = importlib.util.find_spec("sounddevice")
    if spec is None:
        return

    import sounddevice as sd

    try:
        devices = sd.query_devices()
    except Exception as exc:  # pragma: no cover - depends on host audio stack
        _report_device_problem(
            config.strict_device_checks,
            issues,
            warnings,
            f"unable to query audio devices: {exc}",
        )
        return

    has_input = any(device.get("max_input_channels", 0) > 0 for device in devices)
    if not has_input:
        _report_device_problem(
            config.strict_device_checks,
            issues,
            warnings,
            "no audio input device with input channels was detected",
        )


def _check_camera_device(
    config: PiClientConfig,
    issues: list[str],
    warnings: list[str],
) -> None:
    spec = importlib.util.find_spec("cv2")
    if spec is None:
        return

    import cv2

    capture = cv2.VideoCapture(config.camera.device_index)
    try:
        if not capture.isOpened():
            _report_device_problem(
                config.strict_device_checks,
                issues,
                warnings,
                f"camera device {config.camera.device_index} could not be opened",
            )
    finally:
        capture.release()


def _report_device_problem(
    strict: bool,
    issues: list[str],
    warnings: list[str],
    message: str,
) -> None:
    if strict:
        issues.append(message)
    else:
        warnings.append(message)


def _is_writable(path: Path) -> bool:
    try:
        probe_path = path / ".write-test" if path.is_dir() else path
        if path.is_dir():
            probe_path.write_text("", encoding="utf-8")
            probe_path.unlink(missing_ok=True)
        else:
            path.touch(exist_ok=True)
        return True
    except OSError:
        return False
