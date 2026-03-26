from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - handled in health checks
    load_dotenv = None  # type: ignore[assignment]


PI_CLIENT_ROOT = Path(__file__).resolve().parent


def _load_environment() -> None:
    env_path = PI_CLIENT_ROOT / ".env"
    if not env_path.exists():
        return

    if load_dotenv is not None:
        load_dotenv(env_path, override=False)
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_environment()


@dataclass(slots=True)
class PathConfig:
    root_dir: Path
    data_dir: Path
    cache_dir: Path
    logs_dir: Path
    queue_dir: Path
    audio_dir: Path
    image_dir: Path
    sessions_dir: Path
    queue_file: Path
    session_state_file: Path


@dataclass(slots=True)
class AudioConfig:
    chunk_seconds: int
    sample_rate_hz: int
    channels: int
    input_device: int | str | None


@dataclass(slots=True)
class CameraConfig:
    device_index: int
    warmup_seconds: float
    frame_width: int
    frame_height: int
    capture_interval_seconds: int
    jpeg_quality: int
    min_diff_score: float
    min_blur_score: float
    min_quality_score: float


@dataclass(slots=True)
class UploadConfig:
    cloud_api_base_url: str
    legacy_ingest_url: str | None
    api_key: str | None
    timeout_seconds: float
    batch_size: int
    verify_tls: bool
    keep_uploaded_files: bool

    @property
    def session_start_url(self) -> str:
        return _join_cloud_api_url(self.cloud_api_base_url, "/api/v1/sessions/start")

    @property
    def upload_audio_url(self) -> str:
        return _join_cloud_api_url(self.cloud_api_base_url, "/api/v1/uploads/audio")

    @property
    def upload_image_url(self) -> str:
        return _join_cloud_api_url(self.cloud_api_base_url, "/api/v1/uploads/image")

    @property
    def session_end_url(self) -> str:
        return _join_cloud_api_url(self.cloud_api_base_url, "/api/v1/sessions/end")

    @property
    def heartbeat_url(self) -> str:
        return _join_cloud_api_url(self.cloud_api_base_url, "/api/v1/heartbeat")


@dataclass(slots=True)
class LoggingConfig:
    level: str
    file_path: Path


@dataclass(slots=True)
class PiClientConfig:
    device_id: str
    classroom_label: str | None
    session_title_prefix: str
    heartbeat_seconds: float
    strict_device_checks: bool
    transcript_cue_phrases: tuple[str, ...]
    paths: PathConfig
    audio: AudioConfig
    camera: CameraConfig
    upload: UploadConfig
    logging: LoggingConfig


def load_config() -> PiClientConfig:
    data_dir = _resolve_path(
        os.getenv("LECTURE_BUDDY_DATA_DIR"),
        default=PI_CLIENT_ROOT / "data",
    )
    cache_dir = _resolve_path(
        os.getenv("LECTURE_BUDDY_CACHE_DIR"),
        default=PI_CLIENT_ROOT / "cache",
    )
    logs_dir = _resolve_path(
        os.getenv("LECTURE_BUDDY_LOGS_DIR"),
        default=PI_CLIENT_ROOT / "logs",
    )
    queue_dir = _resolve_path(
        os.getenv("LECTURE_BUDDY_QUEUE_DIR"),
        default=PI_CLIENT_ROOT / "queue",
    )

    paths = PathConfig(
        root_dir=PI_CLIENT_ROOT,
        data_dir=data_dir,
        cache_dir=cache_dir,
        logs_dir=logs_dir,
        queue_dir=queue_dir,
        audio_dir=data_dir / "audio",
        image_dir=data_dir / "images",
        sessions_dir=data_dir / "sessions",
        queue_file=queue_dir / "upload-queue.json",
        session_state_file=cache_dir / "current-session.json",
    )

    cloud_api_base_url = _resolve_cloud_api_base_url(
        os.getenv("CLOUD_API_BASE_URL"),
        os.getenv("UPLOAD_INGEST_URL"),
    )

    return PiClientConfig(
        device_id=os.getenv("LECTURE_BUDDY_DEVICE_ID", "raspberry-pi-4b"),
        classroom_label=os.getenv("LECTURE_BUDDY_CLASSROOM_LABEL") or None,
        session_title_prefix=os.getenv("SESSION_TITLE_PREFIX", "Class Session"),
        heartbeat_seconds=float(os.getenv("HEARTBEAT_SECONDS", "1.0")),
        strict_device_checks=_parse_bool(
            os.getenv("STRICT_DEVICE_CHECKS", "false"),
            default=False,
        ),
        transcript_cue_phrases=_parse_tuple(
            os.getenv(
                "TRANSCRIPT_CUE_PHRASES",
                "as you can see,this diagram,write this down,on the board",
            )
        ),
        paths=paths,
        audio=AudioConfig(
            chunk_seconds=int(os.getenv("AUDIO_CHUNK_SECONDS", "15")),
            sample_rate_hz=int(os.getenv("AUDIO_SAMPLE_RATE_HZ", "16000")),
            channels=int(os.getenv("AUDIO_CHANNELS", "1")),
            input_device=_parse_device(os.getenv("AUDIO_INPUT_DEVICE")),
        ),
        camera=CameraConfig(
            device_index=int(os.getenv("CAMERA_DEVICE_INDEX", "0")),
            warmup_seconds=float(os.getenv("CAMERA_WARMUP_SECONDS", "0.25")),
            frame_width=int(os.getenv("CAMERA_FRAME_WIDTH", "1280")),
            frame_height=int(os.getenv("CAMERA_FRAME_HEIGHT", "720")),
            capture_interval_seconds=int(
                os.getenv("IMAGE_CAPTURE_INTERVAL_SECONDS", "12")
            ),
            jpeg_quality=int(os.getenv("IMAGE_JPEG_QUALITY", "92")),
            min_diff_score=float(os.getenv("IMAGE_MIN_DIFF_SCORE", "0.12")),
            min_blur_score=float(os.getenv("IMAGE_MIN_BLUR_SCORE", "85.0")),
            min_quality_score=float(os.getenv("IMAGE_MIN_QUALITY_SCORE", "0.45")),
        ),
        upload=UploadConfig(
            cloud_api_base_url=cloud_api_base_url,
            legacy_ingest_url=os.getenv("UPLOAD_INGEST_URL") or None,
            api_key=os.getenv("UPLOAD_API_KEY") or None,
            timeout_seconds=float(os.getenv("UPLOAD_TIMEOUT_SECONDS", "20")),
            batch_size=int(os.getenv("UPLOAD_BATCH_SIZE", "4")),
            verify_tls=_parse_bool(os.getenv("UPLOAD_VERIFY_TLS", "true"), default=True),
            keep_uploaded_files=_parse_bool(
                os.getenv("KEEP_UPLOADED_FILES", "false"),
                default=False,
            ),
        ),
        logging=LoggingConfig(
            level=os.getenv("LOG_LEVEL", "INFO").upper(),
            file_path=paths.logs_dir / "pi-client.log",
        ),
    )


def ensure_directories(config: PiClientConfig) -> None:
    config.paths.data_dir.mkdir(parents=True, exist_ok=True)
    config.paths.cache_dir.mkdir(parents=True, exist_ok=True)
    config.paths.logs_dir.mkdir(parents=True, exist_ok=True)
    config.paths.queue_dir.mkdir(parents=True, exist_ok=True)
    config.paths.audio_dir.mkdir(parents=True, exist_ok=True)
    config.paths.image_dir.mkdir(parents=True, exist_ok=True)
    config.paths.sessions_dir.mkdir(parents=True, exist_ok=True)
    config.paths.queue_file.touch(exist_ok=True)


def _parse_tuple(raw_value: str) -> tuple[str, ...]:
    items = [item.strip() for item in raw_value.split(",")]
    return tuple(item for item in items if item)


def _parse_bool(raw_value: str | None, *, default: bool) -> bool:
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_device(raw_value: str | None) -> int | str | None:
    if not raw_value:
        return None
    value = raw_value.strip()
    return int(value) if value.isdigit() else value


def _resolve_path(raw_value: str | None, *, default: Path) -> Path:
    if not raw_value:
        return default

    path = Path(raw_value).expanduser()
    if path.is_absolute():
        return path

    return (PI_CLIENT_ROOT / path).resolve()


def _resolve_cloud_api_base_url(
    raw_base_url: str | None,
    legacy_ingest_url: str | None,
) -> str:
    if raw_base_url and raw_base_url.strip():
        return raw_base_url.rstrip("/")

    if legacy_ingest_url and legacy_ingest_url.strip():
        normalized = legacy_ingest_url.rstrip("/")
        legacy_suffixes = (
            "/api/pi-ingest",
            "/api/v1/uploads/audio",
            "/api/v1/uploads/image",
            "/api/v1/sessions/start",
            "/api/v1/sessions/end",
            "/api/v1/heartbeat",
        )
        for suffix in legacy_suffixes:
            if normalized.endswith(suffix):
                return normalized[: -len(suffix)].rstrip("/")
        return normalized

    return "https://example.com"


def _join_cloud_api_url(base_url: str, route_path: str) -> str:
    return f"{base_url.rstrip('/')}{route_path}"
