export type PiControlCommandType =
  | "start_session"
  | "stop_session"
  | "restart_service";

export type PiControlCommandStatus = "pending" | "applied" | "failed";

export interface PiControlCommand {
  commandId: string;
  deviceId: string;
  commandType: PiControlCommandType;
  status: PiControlCommandStatus;
  requestedAt: string;
  requestedBy: string;
  reason?: string;
  lastFetchedAt?: string;
  fetchCount: number;
  appliedAt?: string;
  failedAt?: string;
  errorMessage?: string;
  updatedAt: string;
}

export interface PiDevicePresence {
  deviceId: string;
  lastSeenAt: string;
  lastCommandPollAt: string;
  runtimeStatus?: string;
  activeSessionId?: string;
  deviceIpAddress?: string;
}

export interface PiControlState {
  deviceId: string;
  device: PiDevicePresence | null;
  commands: PiControlCommand[];
}
