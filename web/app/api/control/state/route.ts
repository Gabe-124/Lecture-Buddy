import { NextResponse, type NextRequest } from "next/server";

import { getPiControlState } from "@/app/api/v1/_store";
import { jsonError } from "@/app/api/v1/_utils";

export async function GET(request: NextRequest) {
  try {
    const deviceId = request.nextUrl.searchParams.get("deviceId")?.trim();
    if (!deviceId) {
      throw new Error("deviceId is required.");
    }

    const response = await getPiControlState(deviceId);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to load control state.",
      400,
    );
  }
}
