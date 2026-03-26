import type { UploadImageRequest } from "@/lib/api-contracts";
import { NextResponse, type NextRequest } from "next/server";

import { jsonError, parseUploadRequest, requirePiAuthorization } from "../../_utils";
import { postUploadsImage } from "../../_store";

// TODO(upload-image-storage): Persist uploaded image bytes through the existing cloud storage
// path or UploadThing bridge after the server-side storage handoff is wired.
export async function POST(request: NextRequest) {
  try {
    requirePiAuthorization(request);
    const payload = await parseUploadRequest<UploadImageRequest>(request);
    const response = await postUploadsImage(payload);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to ingest image upload.",
      error instanceof Error && error.message === "Unauthorized Pi API request." ? 401 : 400,
    );
  }
}
