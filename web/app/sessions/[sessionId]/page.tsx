import { notFound } from "next/navigation";

import { ImageGallery } from "@/components/ImageGallery";
import { NotesPanel } from "@/components/NotesPanel";
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

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const bundle = await getDurableSessionBundle(sessionId);

  if (!bundle) {
    notFound();
  }

  const reviewFlags = collectSessionReviewFlags(bundle);
  const controlState = await getPiControlState(bundle.session.deviceId);

  return (
    <SessionDetail
      activeView="notes"
      bundle={bundle}
      controlPanel={<PiControlPanel deviceId={bundle.session.deviceId} initialState={controlState} />}
      primaryPanel={<NotesPanel bundle={bundle} />}
      secondaryPanels={
        <>
          <div className="secondary-grid">
            <UncertaintyPanel flags={reviewFlags} />
          </div>
          <TranscriptPanel
            audioChunkCount={bundle.audioChunks.length}
            images={bundle.capturedImages}
            processingJobStatus={bundle.processingJobStatus}
            segments={bundle.transcriptSegments}
            sessionId={bundle.session.id}
          />
          <ImageGallery
            images={bundle.capturedImages}
            ocrResults={bundle.ocrResults}
            sessionId={bundle.session.id}
            visionResults={bundle.visionResults}
          />
        </>
      }
    />
  );
}
