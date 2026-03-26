import type { UrlObject } from "url";

const DISPLAY_TIME_ZONE = "America/New_York";

export function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}

export function formatClockFromMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }

  return [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatConfidence(value?: number): string {
  if (value === undefined) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

export type SessionRoute<T extends string = string> = `/sessions/${T}`;
export type SessionTranscriptRoute<T extends string = string> = `/sessions/${T}/transcript`;
export type SessionImagesRoute<T extends string = string> = `/sessions/${T}/images`;
type RouteUrlObject<Pathname extends string> = UrlObject & { pathname: Pathname };

export function buildSessionHref<T extends string>(sessionId: T): SessionRoute<T> {
  return `/sessions/${sessionId}`;
}

export function buildSessionTranscriptHref<T extends string>(
  sessionId: T,
): SessionTranscriptRoute<T> {
  return `/sessions/${sessionId}/transcript`;
}

export function buildSessionImagesHref<T extends string>(sessionId: T): SessionImagesRoute<T> {
  return `/sessions/${sessionId}/images`;
}

export function buildTranscriptHref<T extends string>(
  sessionId: T,
  segmentId?: string,
): SessionTranscriptRoute<T> | RouteUrlObject<SessionTranscriptRoute<T>> {
  const pathname = buildSessionTranscriptHref(sessionId);

  if (!segmentId) {
    return pathname;
  }

  return {
    pathname,
    hash: `segment-${segmentId}`,
  };
}

export function buildImageHref<T extends string>(
  sessionId: T,
  imageId?: string,
): SessionImagesRoute<T> | RouteUrlObject<SessionImagesRoute<T>> {
  const pathname = buildSessionImagesHref(sessionId);

  if (!imageId) {
    return pathname;
  }

  return {
    pathname,
    hash: `image-${imageId}`,
  };
}
