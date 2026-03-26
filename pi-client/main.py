from __future__ import annotations

import argparse
import json
import logging
import signal
import sys
from dataclasses import asdict
from logging.handlers import RotatingFileHandler
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from config import ensure_directories, load_config
from health import run_startup_checks


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lecture Buddy Pi client")
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser("run", help="Start or resume a capture session")
    run_parser.add_argument("--title", default=None, help="Human-readable session title")
    run_parser.add_argument(
        "--max-cycles",
        type=int,
        default=None,
        help="Optional cycle limit for testing",
    )

    once_parser = subparsers.add_parser(
        "once",
        help="Start a session, run one cycle, then stop",
    )
    once_parser.add_argument("--title", default=None, help="Human-readable session title")

    subparsers.add_parser("stop", help="Stop the active capture session")
    subparsers.add_parser("flush-queue", help="Upload ready queued items")
    subparsers.add_parser("status", help="Show current session and queue state")
    subparsers.add_parser("healthcheck", help="Validate local Pi client setup")

    return parser.parse_args()


def configure_logging(log_level: str, log_file: Path) -> None:
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)

    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=2_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    root_logger.addHandler(stream_handler)
    root_logger.addHandler(file_handler)


def main() -> int:
    args = parse_args()
    command = args.command or "run"

    config = load_config()
    ensure_directories(config)
    configure_logging(config.logging.level, config.logging.file_path)
    logger = logging.getLogger("pi-client")

    health_report = run_startup_checks(config)
    for warning in health_report.warnings:
        logger.warning(warning)

    if command == "healthcheck":
        print(
            json.dumps(
                {
                    "ok": health_report.ok,
                    "issues": health_report.issues,
                    "warnings": health_report.warnings,
                },
                indent=2,
            )
        )
        return 0 if health_report.ok else 1

    if not health_report.ok:
        logger.error("Startup checks failed.")
        for issue in health_report.issues:
            logger.error(issue)
        return 1

    from session_controller import SessionController

    controller = SessionController(config=config, logger=logging.getLogger("pi-client.session"))

    if command == "status":
        snapshot = controller.snapshot()
        print(
            json.dumps(
                {
                    "runtime_status": snapshot.runtime_status,
                    "queued_uploads": snapshot.queued_uploads,
                    "active_session": (
                        None
                        if snapshot.active_session is None
                        else asdict(snapshot.active_session)
                    ),
                },
                indent=2,
            )
        )
        return 0

    if command == "flush-queue":
        uploaded = controller.flush_queue()
        logger.info("Uploaded %s queued items.", uploaded)
        return 0

    if command == "stop":
        controller.stop_session(reason="cli-stop")
        return 0

    _install_signal_handlers(controller)
    session_title = getattr(args, "title", None) or config.session_title_prefix

    if command == "once":
        controller.run_once(session_title=session_title, stop_after_cycle=True)
        return 0

    controller.run_forever(
        session_title=session_title,
        max_cycles=getattr(args, "max_cycles", None),
    )
    if controller.restart_requested:
        logger.info("Restart requested by control command; exiting for systemd restart.")
        return 75
    return 0


def _install_signal_handlers(controller: "SessionController") -> None:
    def _handle_signal(signum: int, _frame: object) -> None:
        controller.request_stop(reason=f"signal-{signum}")

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)


if __name__ == "__main__":
    raise SystemExit(main())
