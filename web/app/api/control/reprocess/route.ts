import { NextResponse, type NextRequest } from "next/server";

import { postReprocessSession } from "@/app/api/v1/_store";
import {
  jsonError,
  parseJsonRequest,
  requireDashboardControlAuthorization,
} from "@/app/api/v1/_utils";

interface ReprocessRequest {
  sessionId: string;
  controlKey?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseJsonRequest<ReprocessRequest>(request);
    requireDashboardControlAuthorization(payload.controlKey);

    const sessionId = payload.sessionId?.trim();
    if (!sessionId) {
      throw new Error("sessionId is required.");
    }

    const response = await postReprocessSession(sessionId);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reprocess session.";
    const status =
      message === "Unauthorized control action."
        ? 401
        : message === "Dashboard control is not configured."
          ? 503
          : 400;

    return jsonError(message, status);
  }
}
