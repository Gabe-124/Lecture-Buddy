import { NextResponse, type NextRequest } from "next/server";

import { jsonError, parseJsonRequest, requirePiAuthorization } from "@/app/api/v1/_utils";
import { acknowledgePiControlCommand } from "@/app/api/v1/_store";

interface AckCommandRequest {
  commandId: string;
  status: "applied" | "failed";
  errorMessage?: string;
}

export async function POST(request: NextRequest) {
  try {
    requirePiAuthorization(request);
    const payload = await parseJsonRequest<AckCommandRequest>(request);
    if (!payload.commandId) {
      throw new Error("commandId is required.");
    }
    const response = await acknowledgePiControlCommand(payload);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to acknowledge control command.",
      error instanceof Error && error.message === "Unauthorized Pi API request." ? 401 : 400,
    );
  }
}
