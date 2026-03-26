import type { AudioChunk, TranscriptSegment, UncertaintyFlag } from "../../shared/types";

import { loadAudioArtifact } from "./audio_artifact";
import type { AsrInput, AsrOutput, ParakeetCtcV3Adapter, SpeechWindow } from "./types";
import { slicePcmWavWindow } from "./wav";

interface TranscriptionConfig {
  transcribeUrl?: string;
  apiKey?: string;
  language: string;
  model?: string;
  timeoutMs: number;
  openAiApiKey?: string;
  openAiBaseUrl: string;
  openAiModel: string;
}

interface ParsedTranscriptionResponse {
  text: string;
  confidence?: number;
  segments: ParsedTranscriptionSegment[];
}

interface ParsedTranscriptionSegment {
  text: string;
  startMs?: number;
  endMs?: number;
  confidence?: number;
}

export class HttpParakeetCtcV3Adapter implements ParakeetCtcV3Adapter {
  async transcribe(input: AsrInput): Promise<AsrOutput> {
    if (!input.windows.length) {
      return {
        transcriptSegments: [],
        uncertaintyFlags: [],
      };
    }

    const config = readTranscriptionConfig();
    if (!config.transcribeUrl && !config.openAiApiKey) {
      return {
        transcriptSegments: [],
        uncertaintyFlags: [
          buildAudioFlag(
            "parakeet-ctc-v3-not-configured",
            "No ASR backend is configured. Set PARAKEET_TRANSCRIBE_URL or OPENAI_API_KEY so the ASR stage can produce transcripts.",
            undefined,
            "high",
          ),
        ],
      };
    }

    const audioChunkById = new Map<string, AudioChunk>(
      input.audioChunks.map((chunk) => [chunk.id, chunk]),
    );
    const transcriptSegments: TranscriptSegment[] = [];
    const uncertaintyFlags: UncertaintyFlag[] = [];

    for (const window of input.windows) {
      const audioChunk = audioChunkById.get(window.chunkId);
      if (!audioChunk) {
        uncertaintyFlags.push(
          buildAudioFlag(
            "audio-chunk-missing-for-window",
            `Speech window ${window.id} references missing audio chunk ${window.chunkId}.`,
            window.chunkId,
            "high",
          ),
        );
        continue;
      }

      let artifact;
      try {
        artifact = await loadAudioArtifact(audioChunk);
      } catch (error) {
        uncertaintyFlags.push(
          buildAudioFlag(
            "audio-artifact-unavailable",
            error instanceof Error
              ? error.message
              : `Unable to load audio artifact for chunk ${audioChunk.id}.`,
            audioChunk.id,
            "high",
          ),
        );
        continue;
      }

      let requestAudioBytes = artifact.bytes;
      let requestContentType = artifact.contentType ?? inferAudioContentType(artifact.sourceRef);
      let usedPreciseWindowAudio = false;
      let windowCroppingFallbackReason: string | undefined;

      if (window.startMs > 0 || window.endMs < audioChunk.durationMs) {
        try {
          requestAudioBytes = slicePcmWavWindow(artifact.bytes, window.startMs, window.endMs);
          requestContentType = "audio/wav";
          usedPreciseWindowAudio = true;
        } catch (error) {
          windowCroppingFallbackReason = error instanceof Error ? error.message : String(error);
        }
      }

      let response;
      try {
        response = await transcribeWindowAudio({
          config,
          audioBytes: requestAudioBytes,
          contentType: requestContentType,
          fileName: buildWindowFileName(audioChunk, artifact.sourceRef, window),
        });
      } catch (error) {
        uncertaintyFlags.push(
          buildAudioFlag(
            "parakeet-transcription-failed",
            error instanceof Error
              ? error.message
              : `Transcription failed for audio chunk ${audioChunk.id}.`,
            audioChunk.id,
            "high",
          ),
        );
        continue;
      }

      const coarseTimingFlag = buildTranscriptFlag(
        "transcript-timing-coarse",
        "ASR returned transcript text without segment timestamps, so the segment spans the full speech window.",
        window.id,
        "medium",
      );
      const croppingFallbackFlag = windowCroppingFallbackReason
        ? buildTranscriptFlag(
            "audio-window-cropping-fallback",
            `Window-level audio cropping fell back to the full chunk before transcription: ${windowCroppingFallbackReason}`,
            window.id,
            "medium",
          )
        : undefined;

      const segmentsFromResponse = buildTranscriptSegments({
        sessionId: input.sessionId,
        audioChunk,
        window,
        response,
        usedPreciseWindowAudio,
        coarseTimingFlag,
        croppingFallbackFlag,
      });

      if (!segmentsFromResponse.length) {
        uncertaintyFlags.push(
          buildAudioFlag(
            "parakeet-transcription-empty",
            `ASR returned no transcript text for audio chunk ${audioChunk.id}.`,
            audioChunk.id,
            "medium",
          ),
        );
        continue;
      }

      transcriptSegments.push(...segmentsFromResponse);

      if (!config.transcribeUrl && config.openAiApiKey) {
        uncertaintyFlags.push(
          buildAudioFlag(
            "asr-provider-openai-fallback",
            "ASR used OpenAI fallback because PARAKEET_TRANSCRIBE_URL is not configured.",
            audioChunk.id,
            "medium",
          ),
        );
      }
    }

    return {
      transcriptSegments,
      uncertaintyFlags: dedupeUncertaintyFlags(uncertaintyFlags),
    };
  }
}

async function transcribeWindowAudio(input: {
  config: TranscriptionConfig;
  audioBytes: Uint8Array;
  contentType?: string;
  fileName: string;
}): Promise<ParsedTranscriptionResponse> {
  if (!input.config.transcribeUrl && input.config.openAiApiKey) {
    return await transcribeWithOpenAiCompatibleApi(input);
  }

  const formData = new FormData();
  formData.set(
    "file",
    new File([toArrayBuffer(input.audioBytes)], input.fileName, {
      type: input.contentType ?? "audio/wav",
    }),
  );
  formData.set("language", input.config.language);

  if (input.config.model) {
    formData.set("model", input.config.model);
  }

  const headers = new Headers();
  if (input.config.apiKey) {
    headers.set("authorization", `Bearer ${input.config.apiKey}`);
  }

  const response = await fetch(input.config.transcribeUrl!, {
    method: "POST",
    headers,
    body: formData,
    signal: AbortSignal.timeout(input.config.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Parakeet transcription request failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {
      text: (await response.text()).trim(),
      segments: [],
    };
  }

  return parseTranscriptionResponse(await response.json());
}

async function transcribeWithOpenAiCompatibleApi(input: {
  config: TranscriptionConfig;
  audioBytes: Uint8Array;
  contentType?: string;
  fileName: string;
}): Promise<ParsedTranscriptionResponse> {
  const formData = new FormData();
  formData.set(
    "file",
    new File([toArrayBuffer(input.audioBytes)], input.fileName, {
      type: input.contentType ?? "audio/wav",
    }),
  );
  formData.set("model", input.config.openAiModel);
  formData.set("language", input.config.language);
  formData.set("response_format", "verbose_json");

  const headers = new Headers();
  headers.set("authorization", `Bearer ${input.config.openAiApiKey!}`);

  const baseUrl = input.config.openAiBaseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers,
    body: formData,
    signal: AbortSignal.timeout(input.config.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI transcription request failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }

  return parseOpenAiTranscriptionResponse(await response.json());
}

function parseOpenAiTranscriptionResponse(payload: unknown): ParsedTranscriptionResponse {
  if (!payload || typeof payload !== "object") {
    return {
      text: "",
      segments: [],
    };
  }

  const record = payload as Record<string, unknown>;
  const segments = Array.isArray(record.segments)
    ? record.segments
      .map((segment) => parseOpenAiSegment(segment))
      .filter((segment): segment is ParsedTranscriptionSegment => !!segment)
    : [];

  const text = normalizeTranscriptText(
    readString(record.text) ??
      readString(record.transcript) ??
      segments.map((segment) => segment.text).join(" "),
  );

  return {
    text,
    confidence: undefined,
    segments,
  };
}

function parseOpenAiSegment(segment: unknown): ParsedTranscriptionSegment | undefined {
  if (!segment || typeof segment !== "object") {
    return undefined;
  }

  const record = segment as Record<string, unknown>;
  const text = normalizeTranscriptText(readString(record.text));
  if (!text) {
    return undefined;
  }

  return {
    text,
    startMs: readSeconds(record.start),
    endMs: readSeconds(record.end),
    confidence: readNumber(record.avg_logprob),
  };
}

function buildTranscriptSegments(input: {
  sessionId: string;
  audioChunk: AudioChunk;
  window: SpeechWindow;
  response: ParsedTranscriptionResponse;
  usedPreciseWindowAudio: boolean;
  coarseTimingFlag: UncertaintyFlag;
  croppingFallbackFlag?: UncertaintyFlag;
}): TranscriptSegment[] {
  const baseFlags = input.croppingFallbackFlag ? [input.croppingFallbackFlag] : [];
  const canTrustResponseTimings = input.usedPreciseWindowAudio ||
    (input.window.startMs === 0 && input.window.endMs === input.audioChunk.durationMs);
  const responseSegments = canTrustResponseTimings
    ? input.response.segments
      .map((segment, index) => buildSegmentFromResponse(input, segment, index + 1, baseFlags))
      .filter((segment): segment is TranscriptSegment => !!segment)
    : [];

  if (responseSegments.length) {
    return responseSegments;
  }

  const text = normalizeTranscriptText(input.response.text);
  if (!text) {
    return [];
  }

  return [
    {
      id: buildTranscriptSegmentId(input.window.id, 1),
      sessionId: input.sessionId,
      chunkId: input.audioChunk.id,
      startMs: input.window.startMs,
      endMs: input.window.endMs,
      text,
      sourceModel: "parakeet-ctc-v3",
      confidence: input.response.confidence,
      uncertaintyFlags: dedupeUncertaintyFlags([
        ...baseFlags,
        input.coarseTimingFlag,
        ...(!input.usedPreciseWindowAudio && input.window.startMs > 0
          ? [
              buildTranscriptFlag(
                "transcript-window-source-coarse",
                "Transcript text was aligned using the full chunk audio because precise window cropping was unavailable.",
                input.window.id,
                "medium",
              ),
            ]
          : []),
      ]),
    },
  ];
}

function buildSegmentFromResponse(
  input: {
    sessionId: string;
    audioChunk: AudioChunk;
    window: SpeechWindow;
    response: ParsedTranscriptionResponse;
    usedPreciseWindowAudio: boolean;
    coarseTimingFlag: UncertaintyFlag;
  },
  segment: ParsedTranscriptionSegment,
  index: number,
  baseFlags: UncertaintyFlag[],
): TranscriptSegment | undefined {
  const text = normalizeTranscriptText(segment.text);
  if (!text) {
    return undefined;
  }

  if (segment.startMs === undefined || segment.endMs === undefined) {
    return {
      id: buildTranscriptSegmentId(input.window.id, index),
      sessionId: input.sessionId,
      chunkId: input.audioChunk.id,
      startMs: input.window.startMs,
      endMs: input.window.endMs,
      text,
      sourceModel: "parakeet-ctc-v3",
      confidence: segment.confidence ?? input.response.confidence,
      uncertaintyFlags: dedupeUncertaintyFlags([
        ...baseFlags,
        input.coarseTimingFlag,
      ]),
    };
  }

  const absoluteStartMs = input.usedPreciseWindowAudio
    ? input.window.startMs + segment.startMs
    : segment.startMs;
  const absoluteEndMs = input.usedPreciseWindowAudio
    ? input.window.startMs + segment.endMs
    : segment.endMs;

  return {
    id: buildTranscriptSegmentId(input.window.id, index),
    sessionId: input.sessionId,
    chunkId: input.audioChunk.id,
    startMs: Math.max(input.window.startMs, Math.round(absoluteStartMs)),
    endMs: Math.min(input.window.endMs, Math.round(absoluteEndMs)),
    text,
    sourceModel: "parakeet-ctc-v3",
    confidence: segment.confidence ?? input.response.confidence,
    uncertaintyFlags: baseFlags,
  };
}

function parseTranscriptionResponse(payload: unknown): ParsedTranscriptionResponse {
  if (!payload || typeof payload !== "object") {
    return {
      text: "",
      segments: [],
    };
  }

  const record = payload as Record<string, unknown>;
  const segments = Array.isArray(record.segments)
    ? record.segments
      .map((segment) => parseTranscriptionSegment(segment))
      .filter((segment): segment is ParsedTranscriptionSegment => !!segment)
    : [];
  const text = normalizeTranscriptText(
    readString(record.text) ??
      readString(record.transcript) ??
      segments.map((segment) => segment.text).join(" "),
  );

  return {
    text,
    confidence: readNumber(record.confidence),
    segments,
  };
}

function parseTranscriptionSegment(segment: unknown): ParsedTranscriptionSegment | undefined {
  if (!segment || typeof segment !== "object") {
    return undefined;
  }

  const record = segment as Record<string, unknown>;
  const text = normalizeTranscriptText(readString(record.text) ?? readString(record.transcript));
  if (!text) {
    return undefined;
  }

  return {
    text,
    startMs: readMilliseconds(record.startMs) ?? readSeconds(record.start),
    endMs: readMilliseconds(record.endMs) ?? readSeconds(record.end),
    confidence: readNumber(record.confidence),
  };
}

function readTranscriptionConfig(): TranscriptionConfig {
  return {
    transcribeUrl: process.env.PARAKEET_TRANSCRIBE_URL?.trim(),
    apiKey: process.env.PARAKEET_API_KEY?.trim(),
    language: process.env.PARAKEET_LANGUAGE?.trim() || "en",
    model: process.env.PARAKEET_MODEL?.trim(),
    timeoutMs: readTimeoutMs(process.env.PARAKEET_REQUEST_TIMEOUT_MS),
    openAiApiKey: process.env.OPENAI_API_KEY?.trim(),
    openAiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    openAiModel: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "whisper-1",
  };
}

function buildWindowFileName(
  audioChunk: AudioChunk,
  sourceRef: string,
  window: SpeechWindow,
): string {
  const extension = inferFileExtension(sourceRef);
  return `${audioChunk.id}_${window.startMs}_${window.endMs}${extension}`;
}

function buildTranscriptSegmentId(windowId: string, index: number): string {
  return `transcript_${windowId}_${index}`;
}

function buildAudioFlag(
  kind: string,
  message: string,
  relatedId?: string,
  severity: "medium" | "high" = "high",
): UncertaintyFlag {
  return {
    kind,
    message,
    source: "audio",
    severity,
    relatedId,
  };
}

function buildTranscriptFlag(
  kind: string,
  message: string,
  relatedId?: string,
  severity: "low" | "medium" | "high" = "medium",
): UncertaintyFlag {
  return {
    kind,
    message,
    source: "transcript",
    severity,
    relatedId,
  };
}

function dedupeUncertaintyFlags(flags: UncertaintyFlag[]): UncertaintyFlag[] {
  const seen = new Set<string>();
  const deduped: UncertaintyFlag[] = [];

  for (const flag of flags) {
    const key = [
      flag.kind,
      flag.source,
      flag.severity,
      flag.message,
      flag.relatedId ?? "",
    ].join("|");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(flag);
  }

  return deduped;
}

function normalizeTranscriptText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function inferAudioContentType(sourceRef: string): string {
  const extension = inferFileExtension(sourceRef).toLowerCase();
  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
    default:
      return "audio/wav";
  }
}

function inferFileExtension(sourceRef: string): string {
  const cleanRef = sourceRef.split("?")[0] ?? sourceRef;
  const dotIndex = cleanRef.lastIndexOf(".");
  return dotIndex >= 0 ? cleanRef.slice(dotIndex) : ".wav";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readSeconds(value: unknown): number | undefined {
  const seconds = readNumber(value);
  return seconds === undefined ? undefined : Math.round(seconds * 1000);
}

function readMilliseconds(value: unknown): number | undefined {
  const milliseconds = readNumber(value);
  return milliseconds === undefined ? undefined : Math.round(milliseconds);
}

function readTimeoutMs(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
