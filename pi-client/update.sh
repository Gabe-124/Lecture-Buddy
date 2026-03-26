#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"

echo "[lecture-buddy] Updating Raspberry Pi client environment"

mkdir -p \
  "${SCRIPT_DIR}/data" \
  "${SCRIPT_DIR}/data/audio" \
  "${SCRIPT_DIR}/data/images" \
  "${SCRIPT_DIR}/data/sessions" \
  "${SCRIPT_DIR}/cache" \
  "${SCRIPT_DIR}/logs" \
  "${SCRIPT_DIR}/queue"

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "[lecture-buddy] Virtual environment missing, running full install"
  exec "${SCRIPT_DIR}/install.sh"
fi

source "${VENV_DIR}/bin/activate"
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r "${SCRIPT_DIR}/requirements.txt"

if [[ ! -f "${SCRIPT_DIR}/.env" && -f "${SCRIPT_DIR}/.env.example" ]]; then
  cp "${SCRIPT_DIR}/.env.example" "${SCRIPT_DIR}/.env"
  echo "[lecture-buddy] Created local .env from .env.example"
fi

echo "[lecture-buddy] Update complete"
echo "[lecture-buddy] If systemd is enabled, run:"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl restart lecture-buddy-pi.service"
