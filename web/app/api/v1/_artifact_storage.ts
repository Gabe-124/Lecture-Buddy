import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const DEFAULT_LOCAL_AUDIO_ARTIFACT_DIR = "/tmp/lecture-buddy-audio-artifacts";

export interface StoredAudioArtifactRef {
  storageKey: string;
  localPath?: string;
}

interface PersistUploadedAudioArtifactInput {
  file: File;
  sessionId: string;
  audioChunkId: string;
  originalFileName?: string;
}

export async function persistUploadedAudioArtifact(
  input: PersistUploadedAudioArtifactInput,
): Promise<StoredAudioArtifactRef> {
  const safeSessionId = sanitizePathSegment(input.sessionId || "session");
  const safeChunkId = sanitizePathSegment(input.audioChunkId || "audio-chunk");
  const extension = normalizeExtension(input.originalFileName ?? input.file.name);
  const fileName = `${safeChunkId}${extension}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`sessions/${safeSessionId}/audio/${fileName}`, input.file, {
      access: "public",
      addRandomSuffix: true,
    });

    return {
      storageKey: blob.url,
    };
  }

  const artifactDirectory = process.env.LECTURE_BUDDY_AUDIO_ARTIFACT_DIR?.trim() ||
    DEFAULT_LOCAL_AUDIO_ARTIFACT_DIR;
  const sessionDirectory = join(artifactDirectory, safeSessionId);
  const localPath = join(sessionDirectory, fileName);

  await mkdir(sessionDirectory, { recursive: true });
  await writeFile(localPath, new Uint8Array(await input.file.arrayBuffer()));

  return {
    storageKey: localPath,
    localPath,
  };
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return sanitized || "artifact";
}

function normalizeExtension(fileName: string | undefined): string {
  const extension = extname(fileName ?? "").toLowerCase();
  return extension || ".wav";
}
