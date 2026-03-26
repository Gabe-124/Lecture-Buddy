import type { CreateSessionRequest } from "@/lib/api-contracts";
import { NextResponse, type NextRequest } from "next/server";

import { jsonError, parseJsonRequest, requirePiAuthorization } from "../../_utils";
import { postSessionsStart } from "../../_store";

export async function POST(request: NextRequest) {
  try {
    requirePiAuthorization(request);
    const payload = await parseJsonRequest<CreateSessionRequest>(request);
    const response = await postSessionsStart(payload);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to start session.",
      error instanceof Error && error.message === "Unauthorized Pi API request." ? 401 : 400,
    );
  }
}
