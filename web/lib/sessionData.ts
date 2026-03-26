import type { SessionDetailView } from "@/lib/api-contracts";
import type {
  ProcessingJobStatus,
  Session,
  UncertaintyFlag,
} from "@/lib/shared-types";
import type { PiControlState } from "@/lib/control-types";
import { fetchQuery } from "convex/nextjs";

import { lectureBuddyApi } from "@/lib/convexApi";
import { getConvexServerOptions } from "@/lib/convex";

export interface SessionDashboardSummary {
  session: Session;
  processingJobStatus: ProcessingJobStatus | null;
  audioChunkCount: number;
  capturedImageCount: number;
  uploadReceiptCount: number;
  transcriptSegmentCount: number;
  noteSectionCount: number;
  uncertaintyCount: number;
}

export async function getDurableSessions(): Promise<Session[]> {
  return await fetchQuery(lectureBuddyApi.listSessions, {}, getConvexServerOptions());
}

export async function getDurableSessionDashboardSummaries(): Promise<SessionDashboardSummary[]> {
  const sessions = await getDurableSessions();
  const bundles = await Promise.all(
    sessions.map(async (session) => ({
      sessionId: session.id,
      bundle: await getDurableSessionBundle(session.id),
    })),
  );

  const bundleBySessionId = new Map(
    bundles.map(({ sessionId, bundle }) => [sessionId, bundle] as const),
  );

  return sessions.map((session) => {
    const bundle = bundleBySessionId.get(session.id);

    return {
      session,
      processingJobStatus: bundle?.processingJobStatus ?? session.processingJobStatus ?? null,
      audioChunkCount: bundle?.audioChunks.length ?? 0,
      capturedImageCount: bundle?.capturedImages.length ?? 0,
      uploadReceiptCount: bundle?.uploadReceipts.length ?? 0,
      transcriptSegmentCount: bundle?.transcriptSegments.length ?? 0,
      noteSectionCount: bundle?.finalNotes?.sections.length ?? 0,
      uncertaintyCount: bundle?.uncertaintyFlags.length ?? session.uncertaintyFlags.length,
    };
  });
}

export async function getDurableSessionBundle(
  sessionId: string,
): Promise<SessionDetailView | null> {
  return await fetchQuery(
    lectureBuddyApi.getSessionById,
    { sessionId },
    getConvexServerOptions(),
  );
}

export async function getPiControlState(deviceId: string): Promise<PiControlState> {
  return await fetchQuery(
    lectureBuddyApi.getPiControlState,
    { deviceId },
    getConvexServerOptions(),
  );
}

export function collectSessionReviewFlags(bundle: SessionDetailView): UncertaintyFlag[] {
  const seen = new Set<string>();
  const deduped: UncertaintyFlag[] = [];
  const flags = [
    ...bundle.uncertaintyFlags,
    ...bundle.session.uncertaintyFlags,
    ...(bundle.finalNotes?.uncertaintyFlags ?? []),
  ];

  for (const flag of flags) {
    const key = [
      flag.kind,
      flag.severity,
      flag.source,
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
