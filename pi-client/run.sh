#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"

mkdir -p \
  "${SCRIPT_DIR}/data" \
  "${SCRIPT_DIR}/data/audio" \
  "${SCRIPT_DIR}/data/images" \
  "${SCRIPT_DIR}/data/sessions" \
  "${SCRIPT_DIR}/cache" \
  "${SCRIPT_DIR}/logs" \
  "${SCRIPT_DIR}/queue"

if [[ ! -f "${SCRIPT_DIR}/.env" ]]; then
  echo "[lecture-buddy] Missing ${SCRIPT_DIR}/.env"
  echo "[lecture-buddy] Copy .env.example to .env and set local secrets first"
  exit 1
fi

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  echo "[lecture-buddy] Missing virtual environment at ${VENV_DIR}"
  echo "[lecture-buddy] Run ${SCRIPT_DIR}/install.sh first"
  exit 1
fi

source "${VENV_DIR}/bin/activate"
exec python "${SCRIPT_DIR}/main.py" run "$@"
