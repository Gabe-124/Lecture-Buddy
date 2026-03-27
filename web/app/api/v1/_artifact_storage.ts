import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const DEFAULT_LOCAL_AUDIO_ARTIFACT_DIR = "/tmp/lecture-buddy-audio-artifacts";

export interface StoredArtifactRef {
  storageKey: string;
  localPath?: string;
}

interface PersistUploadedAudioArtifactInput {
  file: File;
  sessionId: string;
  audioChunkId: string;
  originalFileName?: string;
}

/**
 * Resolve Blob token from environment variables.
 * Checks both BLOB_READ_WRITE_TOKEN (standard) and Blob_READ_WRITE_TOKEN (legacy).
 * Prefers standard uppercase name if both are present.
 */
function resolveBlobReadWriteToken(): string | undefined {
  const standardToken = normalizeEnvToken(process.env.BLOB_READ_WRITE_TOKEN);
  const legacyToken = normalizeEnvToken(process.env.Blob_READ_WRITE_TOKEN);
  return standardToken || legacyToken;
}

function normalizeEnvToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function persistUploadedAudioArtifact(
  input: PersistUploadedAudioArtifactInput,
): Promise<StoredArtifactRef> {
  return persistUploadedArtifact({ ...input, kind: "audio" });
}

export async function persistUploadedImageArtifact(
  input: PersistUploadedAudioArtifactInput,
): Promise<StoredArtifactRef> {
  return persistUploadedArtifact({ ...input, kind: "image" });
}

async function persistUploadedArtifact(
  input: PersistUploadedAudioArtifactInput & { kind: "audio" | "image" },
): Promise<StoredArtifactRef> {
  const safeSessionId = sanitizePathSegment(input.sessionId || "session");
  const safeChunkId = sanitizePathSegment(input.audioChunkId || "audio-chunk");
  const extension = normalizeExtension(input.originalFileName ?? input.file.name);
  const fileName = `${safeChunkId}${extension}`;
  const blobPath = `sessions/${safeSessionId}/${input.kind}/${fileName}`;
  const hasStandardTokenEnv = !!normalizeEnvToken(process.env.BLOB_READ_WRITE_TOKEN);
  const hasLegacyTokenEnv = !!normalizeEnvToken(process.env.Blob_READ_WRITE_TOKEN);
  const blobToken = resolveBlobReadWriteToken();
  const hasResolvedToken = !!blobToken;

  console.info("[artifact-storage] blob token diagnostics", {
    kind: input.kind,
    hasStandardTokenEnv,
    hasLegacyTokenEnv,
    hasResolvedToken,
    resolvedTokenLength: blobToken?.length ?? 0,
  });

  if (blobToken) {
    const putOptions = {
      access: "public",
      addRandomSuffix: true,
      token: blobToken,
    } as const;

    console.info("[artifact-storage] put call diagnostics", {
      kind: input.kind,
      hasTokenOption: !!putOptions.token,
      tokenOptionLength: putOptions.token.length,
      blobPath,
    });

    const blob = await put(blobPath, input.file, putOptions);

    return {
      storageKey: blob.url,
    };
  }

  if (isProductionEnvironment()) {
    throw new Error(
      "Durable artifact storage is not configured. Set BLOB_READ_WRITE_TOKEN so uploads are persisted for future reprocessing.",
    );
  }

  const artifactDirectory = process.env.LECTURE_BUDDY_AUDIO_ARTIFACT_DIR?.trim() ||
    DEFAULT_LOCAL_AUDIO_ARTIFACT_DIR;
  const sessionDirectory = join(artifactDirectory, safeSessionId, input.kind);
  const localPath = join(sessionDirectory, fileName);

  await mkdir(sessionDirectory, { recursive: true });
  await writeFile(localPath, new Uint8Array(await input.file.arrayBuffer()));

  return {
    storageKey: localPath,
    localPath,
  };
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return sanitized || "artifact";
}

function normalizeExtension(fileName: string | undefined): string {
  const extension = extname(fileName ?? "").toLowerCase();
  return extension || ".wav";
}
