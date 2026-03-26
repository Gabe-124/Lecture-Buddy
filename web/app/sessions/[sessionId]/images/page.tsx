import { notFound } from "next/navigation";

import { ImageGallery } from "@/components/ImageGallery";
import { SessionDetail } from "@/components/SessionDetail";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { getDurableSessionBundle } from "@/lib/sessionData";

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

  return (
    <SessionDetail
      activeView="images"
      bundle={bundle}
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
