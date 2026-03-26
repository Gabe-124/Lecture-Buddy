import { notFound } from "next/navigation";

import { ImageGallery } from "@/components/ImageGallery";
import { PiControlPanel } from "@/components/PiControlPanel";
import { SessionDetail } from "@/components/SessionDetail";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { getDurableSessionBundle, getPiControlState } from "@/lib/sessionData";

export const dynamic = "force-dynamic";

export default async function SessionImagesPage({
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
      activeView="images"
      bundle={bundle}
      controlPanel={<PiControlPanel deviceId={bundle.session.deviceId} initialState={controlState} />}
      primaryPanel={
        <ImageGallery
          images={bundle.capturedImages}
          ocrResults={bundle.ocrResults}
          sessionId={bundle.session.id}
          visionResults={bundle.visionResults}
        />
      }
      secondaryPanels={
        <TranscriptPanel
          audioChunkCount={bundle.audioChunks.length}
          images={bundle.capturedImages}
          processingJobStatus={bundle.processingJobStatus}
          segments={bundle.transcriptSegments}
          sessionId={bundle.session.id}
        />
      }
    />
  );
}
