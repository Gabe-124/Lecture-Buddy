import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";

interface Props {
  sessionId: Id<"sessions">;
}

export function ImageGallery({ sessionId }: Props) {
  const images = useQuery(api.images.listBySession, { sessionId }) ?? [];
  const [selected, setSelected] = useState<(typeof images)[0] | null>(null);

  if (images.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-3xl mb-2">📷</div>
        <p className="text-sm">No images captured.</p>
        <p className="text-xs mt-1">
          {/* TODO: images uploaded via UploadThing from Pi will appear here */}
          Images from the classroom device will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-gray-400 italic mb-3">
        Images captured by the classroom device, linked to session timepoints.
        {/* TODO: clicking a timestamp should seek the transcript */}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((img) => (
          <button
            key={img._id}
            onClick={() => setSelected(img)}
            className="group relative bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-400 transition-colors aspect-video flex items-center justify-center"
          >
            {img.uploadthingUrl ? (
              <img
                src={img.uploadthingUrl}
                alt={img.label ?? "Captured image"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-gray-300 text-3xl">🖼️</div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 flex justify-between">
              <span>{img.label ?? "Image"}</span>
              <span className="font-mono">{formatTime(img.capturedAtOffset)}</span>
            </div>
            {img.vision?.detectedContentType && (
              <span className="absolute top-1 right-1 text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                {img.vision.detectedContentType}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <span className="font-semibold text-gray-800 text-sm">{selected.label ?? "Captured Image"}</span>
                <span className="ml-2 text-xs font-mono text-gray-400">{formatTime(selected.capturedAtOffset)}</span>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            {selected.uploadthingUrl ? (
              <img src={selected.uploadthingUrl} alt="" className="w-full max-h-96 object-contain bg-gray-50" />
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-300 text-5xl bg-gray-50">🖼️</div>
            )}

            <div className="px-4 py-3 space-y-3">
              {selected.vision && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vision Analysis</div>
                  <p className="text-sm text-gray-700">{selected.vision.description}</p>
                  {selected.vision.keyPoints && selected.vision.keyPoints.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {selected.vision.keyPoints.map((kp, i) => (
                        <li key={i} className="text-xs text-gray-600 flex gap-1"><span>•</span>{kp}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {selected.ocr && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">OCR Text</div>
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                    {selected.ocr.rawText}
                  </pre>
                  {selected.ocr.confidence !== undefined && (
                    <span className="text-xs text-gray-400">Confidence: {Math.round(selected.ocr.confidence * 100)}%</span>
                  )}
                </div>
              )}
              {!selected.vision && !selected.ocr && (
                <p className="text-xs text-gray-400 italic">
                  {/* TODO: trigger OCR/vision job on demand */}
                  No analysis available yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
