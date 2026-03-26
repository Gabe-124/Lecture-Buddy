import type { MarkSessionEndedRequest } from "@/lib/api-contracts";
import { NextResponse, type NextRequest } from "next/server";

import { jsonError, parseJsonRequest, requirePiAuthorization } from "../../_utils";
import { postSessionsEnd } from "../../_store";

export async function POST(request: NextRequest) {
  try {
    requirePiAuthorization(request);
    const payload = await parseJsonRequest<MarkSessionEndedRequest>(request);
    const response = await postSessionsEnd(payload);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/v1/sessions/end] request failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return jsonError(
      error instanceof Error ? error.message : "Failed to end session.",
      error instanceof Error && error.message === "Unauthorized Pi API request." ? 401 : 400,
    );
  }
}
