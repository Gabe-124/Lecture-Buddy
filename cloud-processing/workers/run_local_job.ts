import {
  getSessionById,
  postHeartbeat,
  postSessionsEnd,
  postSessionsStart,
  postUploadsAudio,
  postUploadsImage,
} from "../api/routes";

async function main(): Promise<void> {
  const sessionId = "session_local_test_001";

  await postSessionsStart({
    title: "Local smoke test session",
    deviceId: "raspberry-pi-local",
    startedAt: "2026-03-24T12:59:40Z",
    classroomLabel: "Local Lab",
    clientSessionId: sessionId,
  });

  await postUploadsAudio({
    sessionId,
    audioChunk: {
      id: "audio_local_001",
      sessionId,
      sequenceNumber: 1,
      capturedAt: "2026-03-24T12:59:45Z",
      durationMs: 15000,
      sampleRateHz: 16000,
      channels: 1,
      uploadStatus: "uploaded",
      uncertaintyFlags: [],
    },
    artifact: {
      storageKey: "local/audio-0001.wav",
      contentType: "audio/wav",
      originalFileName: "audio-0001.wav",
      fileSizeBytes: 48_000,
    },
  });

  await postUploadsImage({
    sessionId,
    capturedImage: {
      id: "image_local_001",
      sessionId,
      sequenceNumber: 1,
      capturedAt: "2026-03-24T12:59:50Z",
      acceptedForProcessing: true,
      diffScore: 0.48,
      blurScore: 98.1,
      qualityScore: 0.78,
      nearbyTranscriptSegmentIds: [],
      uncertaintyFlags: [],
    },
    artifact: {
      storageKey: "local/image-0001.jpg",
      contentType: "image/jpeg",
      originalFileName: "image-0001.jpg",
      fileSizeBytes: 220_000,
    },
  });

  await postHeartbeat({
    sessionId,
    observedAt: "2026-03-24T13:00:00Z",
    queuedUploadCount: 0,
    lastAudioSequenceNumber: 1,
    lastImageSequenceNumber: 1,
    runtimeStatus: "capturing",
  });

  await postSessionsEnd({
    sessionId,
    endedAt: "2026-03-24T13:00:10Z",
    stopReason: "local-smoke-test",
    lastAudioSequenceNumber: 1,
    lastImageSequenceNumber: 1,
  });

  const sessionDetail = await getSessionById(sessionId);
  console.log(JSON.stringify(sessionDetail, null, 2));
}

void main();
