import type { UploadImageRequest } from "@/lib/api-contracts";
import { NextResponse, type NextRequest } from "next/server";

import { persistUploadedImageArtifact } from "../../_artifact_storage";
import { jsonError, parseUploadRequestWithFile, requirePiAuthorization } from "../../_utils";
import { postUploadsImage } from "../../_store";

export async function POST(request: NextRequest) {
  try {
    requirePiAuthorization(request);
    const { payload, file } = await parseUploadRequestWithFile<UploadImageRequest>(request);

    if (file) {
      const persistedArtifact = await persistUploadedImageArtifact({
        file,
        sessionId: payload.sessionId,
        audioChunkId: String(payload.capturedImage?.id ?? "captured-image"),
        originalFileName: payload.artifact?.originalFileName,
      });

      payload.capturedImage = {
        ...payload.capturedImage,
        localPath: persistedArtifact.localPath ?? payload.capturedImage.localPath,
        storageKey: persistedArtifact.storageKey,
      };
      payload.artifact = {
        ...payload.artifact,
        storageKey: persistedArtifact.storageKey,
      };
    }

    const response = await postUploadsImage(payload);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to ingest image upload.",
      error instanceof Error && error.message === "Unauthorized Pi API request." ? 401 : 400,
    );
  }
}
