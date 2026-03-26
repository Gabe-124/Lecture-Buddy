import type {
  UploadArtifactRef,
  UploadAudioChunkRequest,
  UploadImageRequest,
} from "@/lib/api-contracts";
import { NextResponse, type NextRequest } from "next/server";

type UploadRequest = UploadAudioChunkRequest | UploadImageRequest;

export interface ParsedUploadRequest<T> {
  payload: T;
  file?: File;
}

export async function parseJsonRequest<T>(request: NextRequest): Promise<T> {
  return await request.json() as T;
}

export async function parseUploadRequest<T extends UploadRequest>(
  request: NextRequest,
): Promise<T> {
  const parsed = await parseUploadRequestWithFile<T>(request);
  return parsed.payload;
}

export async function parseUploadRequestWithFile<T extends UploadRequest>(
  request: NextRequest,
): Promise<ParsedUploadRequest<T>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return {
      payload: await parseJsonRequest<T>(request),
    };
  }

  const formData = await request.formData();
  const metadata = formData.get("metadata");
  if (typeof metadata !== "string") {
    throw new Error("Expected multipart field 'metadata' to contain JSON.");
  }

  const payload = JSON.parse(metadata) as T;
  const file = formData.get("file");
  if (file instanceof File) {
    payload.artifact = mergeArtifactMetadata(payload.artifact, file);
  }

  return {
    payload,
    file: file instanceof File ? file : undefined,
  };
}

export function requirePiAuthorization(
  request: Pick<Request, "headers"> | Pick<NextRequest, "headers">,
): void {
  const expectedApiKey = process.env.UPLOAD_API_KEY;
  if (!expectedApiKey) {
    // TODO(pi-route-auth): Keep UPLOAD_API_KEY configured in Vercel so Pi-facing routes
    // require the shared bearer token in production. We keep local dev permissive here.
    return;
  }

  const authorization = request.headers.get("authorization");
  const expectedAuthorization = `Bearer ${expectedApiKey}`;
  if (authorization !== expectedAuthorization) {
    throw new Error("Unauthorized Pi API request.");
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function mergeArtifactMetadata(
  artifact: UploadArtifactRef | undefined,
  file: File,
): UploadArtifactRef {
  return {
    ...artifact,
    contentType: artifact?.contentType ?? (file.type || undefined),
    originalFileName: artifact?.originalFileName ?? file.name,
    fileSizeBytes: artifact?.fileSizeBytes ?? file.size,
  };
}
