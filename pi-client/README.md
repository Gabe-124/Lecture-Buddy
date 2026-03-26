# Raspberry Pi Deployment

This folder is the Raspberry Pi 4B client for the classroom note-taking system. It captures audio chunks and still images, keeps a local upload queue when offline, and uploads artifacts plus metadata to the cloud. Heavy ASR, OCR, diarization, and note generation stay in the cloud.

## Target Pi setup

- Device: Raspberry Pi 4B
- OS: Raspberry Pi OS Lite 64-bit
- Network: Wi-Fi is configured by Raspberry Pi OS, not by this app
- Install path on the Pi: `/opt/lecture-buddy/pi-client`

## Copy the project onto the Pi

Copy the repository so the Pi client ends up at:

```bash
/opt/lecture-buddy/pi-client
```

Example from your laptop:

```bash
scp -r ./Lecture\ Buddy\ 2 pi@raspberrypi.local:/tmp/lecture-buddy
ssh pi@raspberrypi.local
sudo mkdir -p /opt/lecture-buddy
sudo rsync -a /tmp/lecture-buddy/ /opt/lecture-buddy/
sudo chown -R pi:pi /opt/lecture-buddy
```

If you prefer, you can copy only the `pi-client/` folder, but keep it at:

```bash
/opt/lecture-buddy/pi-client
```

## Install on the Pi

```bash
cd /opt/lecture-buddy/pi-client
chmod +x install.sh update.sh run.sh
./install.sh
```

This will:

- install Python and audio/native dependency packages
- create `.venv/`
- install `requirements.txt`
- create local directories:
  - `data/`
  - `cache/`
  - `logs/`
  - `queue/`
- create `.env` from `.env.example` if needed

## Configure local secrets

Edit the local `.env` file on the Pi:

```bash
nano /opt/lecture-buddy/pi-client/.env
```

Set at least:

- `LECTURE_BUDDY_DEVICE_ID`
- `CLOUD_API_BASE_URL`
- `UPLOAD_API_KEY` or your upload secret

The Pi client now targets these cloud API routes off `CLOUD_API_BASE_URL`:

- `POST /api/v1/sessions/start`
- `POST /api/v1/uploads/audio`
- `POST /api/v1/uploads/image`
- `POST /api/v1/sessions/end`
- `POST /api/v1/heartbeat`
- `GET /api/v1/sessions/:id`
- `POST /api/v1/control/commands/next`
- `POST /api/v1/control/commands/ack`

Control flow uses outbound polling only (no inbound port on the Pi):

- dashboard enqueues a command in cloud storage
- Pi polls `POST /api/v1/control/commands/next`
- Pi applies command locally and acknowledges via `POST /api/v1/control/commands/ack`

`UPLOAD_INGEST_URL` is kept only as a backward-compatible fallback while you migrate older local `.env` files.

Do not put Wi-Fi credentials in this repository. Raspberry Pi OS should manage networking separately.

## Run manually

```bash
cd /opt/lecture-buddy/pi-client
./run.sh
```

Health check:

```bash
cd /opt/lecture-buddy/pi-client
.venv/bin/python main.py healthcheck
```

## Enable systemd startup

Copy the included service file into systemd:

```bash
sudo cp /opt/lecture-buddy/pi-client/lecture-buddy-pi.service /etc/systemd/system/lecture-buddy-pi.service
sudo systemctl daemon-reload
sudo systemctl enable lecture-buddy-pi.service
sudo systemctl start lecture-buddy-pi.service
```

## Check service status and logs

Service status:

```bash
sudo systemctl status lecture-buddy-pi.service
```

Live logs:

```bash
sudo journalctl -u lecture-buddy-pi.service -f
```

Recent logs:

```bash
sudo journalctl -u lecture-buddy-pi.service -n 100
```

Application log file:

```bash
tail -f /opt/lecture-buddy/pi-client/logs/pi-client.log
```

## Stop and restart the service

Stop:

```bash
sudo systemctl stop lecture-buddy-pi.service
```

Start:

```bash
sudo systemctl start lecture-buddy-pi.service
```

Restart:

```bash
sudo systemctl restart lecture-buddy-pi.service
```

Disable auto-start:

```bash
sudo systemctl disable lecture-buddy-pi.service
```

## Update after code changes

After copying new code onto the Pi:

```bash
cd /opt/lecture-buddy/pi-client
./update.sh
sudo systemctl daemon-reload
sudo systemctl restart lecture-buddy-pi.service
```

## Notes

- Secrets stay in the local `.env` file on the Pi.
- This setup does not assume a desktop environment.
- This setup does not use Docker for the first hardware test.
