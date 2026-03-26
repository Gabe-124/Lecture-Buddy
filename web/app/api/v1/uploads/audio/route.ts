import type { UploadAudioChunkRequest } from "@/lib/api-contracts";
import { NextResponse, type NextRequest } from "next/server";

import { persistUploadedAudioArtifact } from "../../_artifact_storage";
import { jsonError, parseUploadRequestWithFile, requirePiAuthorization } from "../../_utils";
import { postUploadsAudio } from "../../_store";

export async function POST(request: NextRequest) {
  try {
    requirePiAuthorization(request);
    const { payload, file } = await parseUploadRequestWithFile<UploadAudioChunkRequest>(request);

    if (file) {
      const persistedArtifact = await persistUploadedAudioArtifact({
        file,
        sessionId: payload.sessionId,
        audioChunkId: String(payload.audioChunk?.id ?? "audio-chunk"),
        originalFileName: payload.artifact?.originalFileName,
      });

      payload.audioChunk = {
        ...payload.audioChunk,
        localPath: persistedArtifact.localPath ?? payload.audioChunk.localPath,
        storageKey: persistedArtifact.storageKey,
      };
      payload.artifact = {
        ...payload.artifact,
        storageKey: persistedArtifact.storageKey,
      };
    }

    const response = await postUploadsAudio(payload);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to ingest audio upload.",
      error instanceof Error && error.message === "Unauthorized Pi API request." ? 401 : 400,
    );
  }
}
