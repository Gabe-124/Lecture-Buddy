from __future__ import annotations

import logging
from dataclasses import dataclass, field

try:
    import requests
except ImportError:  # pragma: no cover - validated in health checks
    requests = None  # type: ignore[assignment]

from config import PiClientConfig


@dataclass(slots=True)
class ControlClient:
    config: PiClientConfig
    logger: logging.Logger = field(
        default_factory=lambda: logging.getLogger(__name__),
        repr=False,
    )

    def poll_next_command(
        self,
        *,
        runtime_status: str,
        active_session_id: str | None,
        device_ip_address: str | None,
    ) -> dict[str, object] | None:
        if requests is None:
            return None

        try:
            response = requests.post(
                self.config.upload.control_poll_url,
                headers=self._build_headers(),
                json={
                    "deviceId": self.config.device_id,
                    "runtimeStatus": runtime_status,
                    "activeSessionId": active_session_id,
                    "deviceIpAddress": device_ip_address,
                },
                timeout=self.config.upload.timeout_seconds,
                verify=self.config.upload.verify_tls,
            )
            if response.status_code == 401:
                self.logger.error("Control poll unauthorized. Check UPLOAD_API_KEY.")
                return None
            if response.status_code >= 400:
                self.logger.warning(
                    "Control poll failed: %s %s",
                    response.status_code,
                    response.text[:200],
                )
                return None
            data = response.json()
            command = data.get("command")
            return command if isinstance(command, dict) else None
        except requests.RequestException as exc:
            self.logger.debug("Control poll network error: %s", exc)
            return None

    def acknowledge_command(
        self,
        *,
        command_id: str,
        status: str,
        error_message: str | None = None,
    ) -> None:
        if requests is None:
            return

        payload: dict[str, object] = {
            "commandId": command_id,
            "status": status,
        }
        if error_message:
            payload["errorMessage"] = error_message

        try:
            response = requests.post(
                self.config.upload.control_ack_url,
                headers=self._build_headers(),
                json=payload,
                timeout=self.config.upload.timeout_seconds,
                verify=self.config.upload.verify_tls,
            )
            if response.status_code >= 400:
                self.logger.warning(
                    "Command acknowledge failed for %s: %s %s",
                    command_id,
                    response.status_code,
                    response.text[:200],
                )
        except requests.RequestException as exc:
            self.logger.warning("Command acknowledge network error for %s: %s", command_id, exc)

    def _build_headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "lecture-buddy-pi-client/1.0",
            "X-Device-Id": self.config.device_id,
        }
        if self.config.upload.api_key:
            headers["Authorization"] = f"Bearer {self.config.upload.api_key}"
        return headers
