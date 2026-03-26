#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"

echo "[lecture-buddy] Raspberry Pi install starting"

if command -v apt-get >/dev/null 2>&1; then
  echo "[lecture-buddy] Installing OS packages for Raspberry Pi OS Lite"
  sudo apt-get update
  sudo apt-get install -y \
    python3 \
    python3-venv \
    python3-dev \
    build-essential \
    portaudio19-dev \
    libportaudio2 \
    libsndfile1 \
    libatlas-base-dev \
    libjpeg-dev \
    libopenblas-dev
fi

echo "[lecture-buddy] Creating local runtime directories"
mkdir -p \
  "${SCRIPT_DIR}/data" \
  "${SCRIPT_DIR}/data/audio" \
  "${SCRIPT_DIR}/data/images" \
  "${SCRIPT_DIR}/data/sessions" \
  "${SCRIPT_DIR}/cache" \
  "${SCRIPT_DIR}/logs" \
  "${SCRIPT_DIR}/queue"

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "[lecture-buddy] Creating virtual environment"
  python3 -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r "${SCRIPT_DIR}/requirements.txt"

if [[ ! -f "${SCRIPT_DIR}/.env" && -f "${SCRIPT_DIR}/.env.example" ]]; then
  cp "${SCRIPT_DIR}/.env.example" "${SCRIPT_DIR}/.env"
  echo "[lecture-buddy] Created local .env from .env.example"
fi

chmod +x "${SCRIPT_DIR}/run.sh" "${SCRIPT_DIR}/update.sh" "${SCRIPT_DIR}/install.sh"

echo "[lecture-buddy] Install complete"
echo "[lecture-buddy] Edit ${SCRIPT_DIR}/.env with your device id and cloud endpoint details"
echo "[lecture-buddy] Start manually with: ${SCRIPT_DIR}/run.sh"
