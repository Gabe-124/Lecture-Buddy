import { readFile } from "node:fs/promises";

import type { AudioChunk } from "@/lib/shared-types";

export interface LoadedAudioArtifact {
  bytes: Uint8Array;
  contentType?: string;
  sourceRef: string;
}

export async function loadAudioArtifact(chunk: AudioChunk): Promise<LoadedAudioArtifact> {
  const candidateRefs = dedupeRefs([chunk.storageKey, chunk.localPath]);

  if (!candidateRefs.length) {
    throw new Error(`No artifact reference is available for audio chunk ${chunk.id}.`);
  }

  let lastError: Error | undefined;

  for (const ref of candidateRefs) {
    try {
      if (isHttpUrl(ref)) {
        const response = await fetch(ref);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} while fetching audio artifact.`);
        }

        return {
          bytes: new Uint8Array(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") ?? undefined,
          sourceRef: ref,
        };
      }

      const resolvedPath = ref.startsWith("file://") ? new URL(ref) : ref;
      return {
        bytes: new Uint8Array(await readFile(resolvedPath)),
        sourceRef: ref,
      };
    } catch (error) {
      lastError = toArtifactLoadError(chunk.id, ref, error);
    }
  }

  throw lastError ?? new Error(`Unable to load audio artifact for chunk ${chunk.id}.`);
}

function dedupeRefs(refs: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const ref of refs) {
    const normalized = ref?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function toArtifactLoadError(chunkId: string, ref: string, error: unknown): Error {
  if (
    isMissingFileError(error) &&
    ref.includes("/tmp/lecture-buddy-audio-artifacts/")
  ) {
    return new Error(
      `Audio for this session is no longer available for reprocessing (chunk ${chunkId}).`,
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === "ENOENT";
}
