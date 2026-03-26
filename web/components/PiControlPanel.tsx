"use client";

import { useEffect, useMemo, useState } from "react";

import type { PiControlCommandType, PiControlState } from "@/lib/control-types";

interface PiControlPanelProps {
  deviceId: string;
  initialState: PiControlState;
}

const OFFLINE_THRESHOLD_SECONDS = 45;

export function PiControlPanel({ deviceId, initialState }: PiControlPanelProps) {
  const [controlKey, setControlKey] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<PiControlState>(initialState);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const online = useMemo(() => {
    const lastSeenAt = state.device?.lastSeenAt;
    if (!lastSeenAt) {
      return false;
    }
    const secondsAgo = (Date.now() - new Date(lastSeenAt).getTime()) / 1000;
    return Number.isFinite(secondsAgo) && secondsAgo <= OFFLINE_THRESHOLD_SECONDS;
  }, [state.device?.lastSeenAt]);

  async function refreshState() {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/control/state?deviceId=${encodeURIComponent(deviceId)}`, {
        cache: "no-store",
      });
      const nextState = (await response.json()) as PiControlState;
      if (response.ok) {
        setState(nextState);
      }
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshState();
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  async function sendCommand(commandType: PiControlCommandType) {
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/control/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId,
          commandType,
          reason: reason.trim() || undefined,
          controlKey,
        }),
      });
      const payload = (await response.json()) as { error?: string; commandId?: string };
      if (!response.ok) {
        setStatusMessage(payload.error ?? "Failed to send command.");
        return;
      }

      setStatusMessage("Command queued.");
      await refreshState();
    } catch {
      setStatusMessage("Network error while sending command.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="card control-panel">
      <div className="panel-header">
        <div>
          <span className="badge">Pi control</span>
          <h3>Remote controls</h3>
        </div>
        <button className="tablink" disabled={isRefreshing} onClick={() => void refreshState()} type="button">
          {isRefreshing ? "Refreshing..." : "Refresh status"}
        </button>
      </div>

      <div className="control-panel__meta-row">
        <span className={online ? "badge badge--success" : "badge badge--warning"}>
          {online ? "Online" : "Offline"}
        </span>
        <span className="meta">Device {deviceId}</span>
        <span className="meta">Last seen {state.device?.lastSeenAt ? formatDate(state.device.lastSeenAt) : "Never"}</span>
        <span className="meta">Runtime {state.device?.runtimeStatus ?? "unknown"}</span>
      </div>

      <div className="control-panel__form-grid">
        <label className="control-panel__field">
          <span className="meta">Control key</span>
          <input
            autoComplete="off"
            className="control-panel__input"
            onChange={(event) => setControlKey(event.target.value)}
            type="password"
            value={controlKey}
          />
        </label>
        <label className="control-panel__field">
          <span className="meta">Reason (optional)</span>
          <input
            className="control-panel__input"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Operator note"
            type="text"
            value={reason}
          />
        </label>
      </div>

      <div className="control-panel__actions">
        <button className="tablink" disabled={isSubmitting || !controlKey} onClick={() => void sendCommand("start_session")} type="button">
          Start session
        </button>
        <button className="tablink" disabled={isSubmitting || !controlKey} onClick={() => void sendCommand("stop_session")} type="button">
          Stop session
        </button>
        <button className="tablink" disabled={isSubmitting || !controlKey} onClick={() => void sendCommand("restart_service")} type="button">
          Restart service
        </button>
      </div>

      {statusMessage ? <p className="meta">{statusMessage}</p> : null}

      <details className="hero__details">
        <summary>Recent commands</summary>
        <div className="control-panel__commands">
          {state.commands.length === 0 ? (
            <p className="meta">No control commands yet.</p>
          ) : (
            state.commands.slice(0, 8).map((command) => (
              <div className="control-panel__command-row" key={command.commandId}>
                <span className="meta mono">{command.commandId}</span>
                <span className="meta">{formatLabel(command.commandType)}</span>
                <span className={`badge badge--subtle`}>{formatLabel(command.status)}</span>
                <span className="meta">Requested {formatDate(command.requestedAt)}</span>
                {command.errorMessage ? <span className="meta">Error: {command.errorMessage}</span> : null}
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
