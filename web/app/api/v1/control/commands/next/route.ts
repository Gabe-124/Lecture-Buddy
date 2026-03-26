import { NextResponse, type NextRequest } from "next/server";

import { jsonError, parseJsonRequest, requirePiAuthorization } from "@/app/api/v1/_utils";
import { pollNextPiControlCommand } from "@/app/api/v1/_store";

interface PollCommandRequest {
  deviceId: string;
  runtimeStatus?: string;
  activeSessionId?: string;
  deviceIpAddress?: string;
}

export async function POST(request: NextRequest) {
  try {
    requirePiAuthorization(request);
    const payload = await parseJsonRequest<PollCommandRequest>(request);
    if (!payload.deviceId) {
      throw new Error("deviceId is required.");
    }
    const response = await pollNextPiControlCommand(payload);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to poll control command.",
      error instanceof Error && error.message === "Unauthorized Pi API request." ? 401 : 400,
    );
  }
}
