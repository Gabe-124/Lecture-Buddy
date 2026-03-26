import { buildSessionDetailView, type SessionDetailView } from "../lib/api-contracts";
import type { FetchSessionResultsResponse } from "../lib/api-contracts";
import type { Session } from "../lib/shared-types";

export interface SessionListItemView {
  session: Session;
  transcriptSegmentCount: number;
  capturedImageCount: number;
  unresolvedUncertaintyCount: number;
  hasFinalNotes: boolean;
}

export const convexSessionQueryPlan = {
  listSessions:
    "Return recent sessions from Convex with title, status, mode window count, and unresolved uncertainty count.",
  getSessionDetailView:
    "Return a stable SessionDetailView assembled from Convex tables without exposing UploadThing internals to Pi-facing callers.",
};

export function toStableSessionDetailView(
  response: FetchSessionResultsResponse,
): SessionDetailView {
  return buildSessionDetailView(response);
}

export function toSessionListItemView(detail: SessionDetailView): SessionListItemView {
  return {
    session: detail.session,
    transcriptSegmentCount: detail.transcriptSegments.length,
    capturedImageCount: detail.capturedImages.length,
    unresolvedUncertaintyCount: detail.uncertaintyFlags.length,
    hasFinalNotes: detail.finalNotes !== null,
  };
}
