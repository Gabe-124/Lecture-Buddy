import { NextResponse, type NextRequest } from "next/server";

import { enqueuePiControlCommand } from "@/app/api/v1/_store";
import {
  jsonError,
  parseJsonRequest,
  requireDashboardControlAuthorization,
} from "@/app/api/v1/_utils";

interface EnqueueControlCommandRequest {
  deviceId: string;
  commandType: "start_session" | "stop_session" | "restart_service";
  reason?: string;
  controlKey?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseJsonRequest<EnqueueControlCommandRequest>(request);
    requireDashboardControlAuthorization(payload.controlKey);

    if (!payload.deviceId) {
      throw new Error("deviceId is required.");
    }

    const response = await enqueuePiControlCommand({
      deviceId: payload.deviceId,
      commandType: payload.commandType,
      reason: payload.reason,
      requestedBy: "dashboard",
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue control command.";
    const status =
      message === "Unauthorized control action."
        ? 401
        : message === "Dashboard control is not configured."
          ? 503
          : 400;
    return jsonError(message, status);
  }
}
