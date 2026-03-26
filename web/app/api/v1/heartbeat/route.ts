import type { HeartbeatRequest } from "@/lib/api-contracts";
import { NextResponse, type NextRequest } from "next/server";

import { jsonError, parseJsonRequest, requirePiAuthorization } from "../_utils";
import { postHeartbeat } from "../_store";

export async function POST(request: NextRequest) {
  try {
    requirePiAuthorization(request);
    const payload = await parseJsonRequest<HeartbeatRequest>(request);
    const response = await postHeartbeat(payload);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to record heartbeat.",
      error instanceof Error && error.message === "Unauthorized Pi API request." ? 401 : 400,
    );
  }
}
