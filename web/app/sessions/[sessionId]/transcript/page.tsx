import { notFound } from "next/navigation";

import { PiControlPanel } from "@/components/PiControlPanel";
import { SessionDetail } from "@/components/SessionDetail";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { UncertaintyPanel } from "@/components/UncertaintyPanel";
import {
  collectSessionReviewFlags,
  getDurableSessionBundle,
  getPiControlState,
} from "@/lib/sessionData";

export const dynamic = "force-dynamic";

export default async function SessionTranscriptPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const bundle = await getDurableSessionBundle(sessionId);

  if (!bundle) {
    notFound();
  }

  const controlState = await getPiControlState(bundle.session.deviceId);

  return (
    <SessionDetail
      activeView="transcript"
      bundle={bundle}
      controlPanel={<PiControlPanel deviceId={bundle.session.deviceId} initialState={controlState} />}
      primaryPanel={
        <TranscriptPanel
          audioChunkCount={bundle.audioChunks.length}
          images={bundle.capturedImages}
          processingJobStatus={bundle.processingJobStatus}
          segments={bundle.transcriptSegments}
          sessionId={bundle.session.id}
        />
      }
      secondaryPanels={<UncertaintyPanel flags={collectSessionReviewFlags(bundle)} />}
    />
  );
}
