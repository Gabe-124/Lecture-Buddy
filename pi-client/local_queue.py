from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TypeAlias


JSONScalar: TypeAlias = str | int | float | bool | None
JSONValue: TypeAlias = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass(slots=True)
class QueueUploadItem:
    kind: str
    session_id: str
    metadata: dict[str, JSONValue]
    file_path: str | None = None
    mime_type: str | None = None
    captured_at: str | None = None
    created_at: str = field(default_factory=utc_now)
    attempts: int = 0
    next_attempt_at: float = 0.0
    last_error: str | None = None
    id: str = field(default_factory=lambda: f"queue_{uuid.uuid4().hex[:12]}")

    @classmethod
    def from_dict(cls, raw_item: dict[str, JSONValue]) -> "QueueUploadItem":
        return cls(
            kind=str(raw_item["kind"]),
            session_id=str(raw_item["session_id"]),
            metadata=dict(raw_item.get("metadata", {})),
            file_path=_string_or_none(raw_item.get("file_path")),
            mime_type=_string_or_none(raw_item.get("mime_type")),
            captured_at=_string_or_none(raw_item.get("captured_at")),
            created_at=str(raw_item.get("created_at", utc_now())),
            attempts=int(raw_item.get("attempts", 0)),
            next_attempt_at=float(raw_item.get("next_attempt_at", 0.0)),
            last_error=_string_or_none(raw_item.get("last_error")),
            id=str(raw_item.get("id", f"queue_{uuid.uuid4().hex[:12]}")),
        )


class FileBackedQueue:
    def __init__(self, queue_file: Path, logger: logging.Logger | None = None) -> None:
        self.queue_file = queue_file
        self.logger = logger or logging.getLogger(__name__)
        self._lock = threading.Lock()
        self.queue_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.queue_file.exists():
            self._write_items([])

    def enqueue(self, item: QueueUploadItem) -> None:
        with self._lock:
            items = self._read_items_unlocked()
            items.append(asdict(item))
            self._write_items(items)
        self.logger.info(
            "Enqueued %s item %s for session %s",
            item.kind,
            item.id,
            item.session_id,
        )

    def get_ready_batch(self, limit: int) -> list[QueueUploadItem]:
        now = time.time()
        with self._lock:
            items = self._read_items_unlocked()
        ready_items = [
            QueueUploadItem.from_dict(item)
            for item in items
            if float(item.get("next_attempt_at", 0.0)) <= now
        ]
        return ready_items[:limit]

    def mark_done(self, item_id: str) -> None:
        with self._lock:
            items = self._read_items_unlocked()
            remaining = [item for item in items if item.get("id") != item_id]
            self._write_items(remaining)
        self.logger.info("Removed uploaded queue item %s", item_id)

    def mark_retry(self, item_id: str, error: str, backoff_seconds: float) -> None:
        with self._lock:
            items = self._read_items_unlocked()
            for item in items:
                if item.get("id") != item_id:
                    continue
                item["attempts"] = int(item.get("attempts", 0)) + 1
                item["next_attempt_at"] = time.time() + backoff_seconds
                item["last_error"] = error
                break
            self._write_items(items)
        self.logger.warning(
            "Queue item %s scheduled for retry in %.1fs: %s",
            item_id,
            backoff_seconds,
            error,
        )

    def size(self) -> int:
        with self._lock:
            return len(self._read_items_unlocked())

    def snapshot(self) -> list[QueueUploadItem]:
        with self._lock:
            return [QueueUploadItem.from_dict(item) for item in self._read_items_unlocked()]

    def _read_items_unlocked(self) -> list[dict[str, JSONValue]]:
        if not self.queue_file.exists():
            return []
        raw_text = self.queue_file.read_text(encoding="utf-8").strip()
        if not raw_text:
            return []
        raw_items = json.loads(raw_text)
        if not isinstance(raw_items, list):
            raise ValueError(f"Queue file must contain a JSON list: {self.queue_file}")
        return [dict(item) for item in raw_items]

    def _write_items(self, items: list[dict[str, JSONValue]]) -> None:
        temp_path = self.queue_file.with_suffix(f"{self.queue_file.suffix}.tmp")
        temp_path.write_text(json.dumps(items, indent=2), encoding="utf-8")
        temp_path.replace(self.queue_file)


def _string_or_none(value: JSONValue) -> str | None:
    if value is None:
        return None
    return str(value)
