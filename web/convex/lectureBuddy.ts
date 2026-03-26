import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

export const listSessions = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const sessionDocs = await ctx.db.query("sessions").collect();
    const sessions = await Promise.all(
      sessionDocs.map(async (sessionDoc) => {
        const modeWindowDocs = await listModeWindows(ctx, sessionDoc.sessionId);
        return toSessionView(sessionDoc, modeWindowDocs);
      }),
    );

    return sessions.sort(compareStartedAtDesc);
  },
});

export const getSessionById = queryGeneric({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await findSessionDocBySessionId(ctx, args.sessionId);
    if (!sessionDoc) {
      return null;
    }

    const [
      audioChunkDocs,
      transcriptSegmentDocs,
      speakerSegmentDocs,
      capturedImageDocs,
      modeWindowDocs,
      finalNotesDoc,
      uploadReceiptDocs,
    ] = await Promise.all([
      listAudioChunks(ctx, args.sessionId),
      listTranscriptSegments(ctx, args.sessionId),
      listSpeakerSegments(ctx, args.sessionId),
      listCapturedImages(ctx, args.sessionId),
      listModeWindows(ctx, args.sessionId),
      findFinalNotes(ctx, args.sessionId),
      listUploadReceipts(ctx, args.sessionId),
    ]);

    const [ocrResultDocs, visionResultDocs] = await Promise.all([
      listOcrResults(ctx, capturedImageDocs.map((imageDoc) => imageDoc.imageId)),
      listVisionResults(ctx, capturedImageDocs.map((imageDoc) => imageDoc.imageId)),
    ]);

    const finalNotes = finalNotesDoc ? toFinalNotesView(finalNotesDoc) : null;
    const transcriptSegments = transcriptSegmentDocs.map(toTranscriptSegmentView);
    const speakerSegments = speakerSegmentDocs.map(toSpeakerSegmentView);
    const capturedImages = capturedImageDocs.map(toCapturedImageView);
    const ocrResults = ocrResultDocs.map(toOcrResultView);
    const visionResults = visionResultDocs.map(toVisionResultView);
    const modeWindows = modeWindowDocs.map(toModeWindowView);
    const uploadReceipts = uploadReceiptDocs.map(toUploadReceiptView);
    const session = toSessionView(sessionDoc, modeWindowDocs);

    return {
      session,
      audioChunks: audioChunkDocs.map(toAudioChunkView),
      transcriptSegments,
      speakerSegments,
      capturedImages,
      ocrResults,
      visionResults,
      modeWindows,
      finalNotes,
      processingJobStatus: sessionDoc.processingJobStatus ?? null,
      uploadReceipts,
      uncertaintyFlags: dedupeUncertaintyFlags([
        ...coerceArray(session.uncertaintyFlags),
        ...transcriptSegments.flatMap((segment) => coerceArray(segment.uncertaintyFlags)),
        ...speakerSegments.flatMap((segment) => coerceArray(segment.uncertaintyFlags)),
        ...capturedImages.flatMap((image) => coerceArray(image.uncertaintyFlags)),
        ...ocrResults.flatMap((result) => coerceArray(result.uncertaintyFlags)),
        ...visionResults.flatMap((result) => coerceArray(result.uncertaintyFlags)),
        ...modeWindows.flatMap((window) => coerceArray(window.uncertaintyFlags)),
        ...(finalNotes ? coerceArray(finalNotes.uncertaintyFlags) : []),
        ...(finalNotes
          ? finalNotes.sections.flatMap((section: Record<string, unknown>) =>
              coerceArray(section.uncertaintyFlags),
            )
          : []),
        ...uploadReceipts.flatMap((receipt) => coerceArray(receipt.uncertaintyFlags)),
      ]),
    };
  },
});

export const getPiControlState = queryGeneric({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const deviceDoc = await findPiDeviceDocByDeviceId(ctx, args.deviceId);
    const commandDocs = await ctx.db
      .query("piControlCommands")
      .withIndex("by_device", (q: any) => q.eq("deviceId", args.deviceId))
      .collect();

    const commands = commandDocs
      .sort(compareTimestampDescending("requestedAt"))
      .slice(0, 20)
      .map(toPiControlCommandView);

    return {
      deviceId: args.deviceId,
      device: deviceDoc
        ? {
            deviceId: deviceDoc.deviceId,
            lastSeenAt: deviceDoc.lastSeenAt,
            lastCommandPollAt: deviceDoc.lastCommandPollAt,
            runtimeStatus: readString(deviceDoc.runtimeStatus),
            activeSessionId: readString(deviceDoc.activeSessionId),
            deviceIpAddress: readString(deviceDoc.deviceIpAddress),
          }
        : null,
      commands,
    };
  },
});

export const enqueuePiControlCommand = mutationGeneric({
  args: {
    deviceId: v.string(),
    commandType: v.union(
      v.literal("start_session"),
      v.literal("stop_session"),
      v.literal("restart_service"),
    ),
    requestedBy: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = nowIsoString();
    const commandId = [
      "cmd",
      args.deviceId,
      now.replace(/[^0-9]+/g, ""),
      Math.random().toString(36).slice(2, 8),
    ].join("_");

    await ctx.db.insert("piControlCommands", {
      commandId,
      deviceId: args.deviceId,
      commandType: args.commandType,
      status: "pending",
      requestedAt: now,
      requestedBy: args.requestedBy,
      reason: args.reason,
      fetchCount: 0,
      updatedAt: now,
    });

    const commandDoc = await findPiControlCommandDocByCommandId(ctx, commandId);
    if (!commandDoc) {
      throw new Error(`Unable to load command after enqueue: ${commandId}`);
    }

    return toPiControlCommandView(commandDoc);
  },
});

export const pollNextPiControlCommand = mutationGeneric({
  args: {
    deviceId: v.string(),
    runtimeStatus: v.optional(v.string()),
    activeSessionId: v.optional(v.string()),
    deviceIpAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = nowIsoString();

    await upsertPiDevicePresence(ctx, {
      deviceId: args.deviceId,
      runtimeStatus: args.runtimeStatus,
      activeSessionId: args.activeSessionId,
      deviceIpAddress: args.deviceIpAddress,
      observedAt: now,
    });

    const pendingCommands = await ctx.db
      .query("piControlCommands")
      .withIndex("by_device_status", (q: any) =>
        q.eq("deviceId", args.deviceId).eq("status", "pending"),
      )
      .collect();

    const nextCommand = pendingCommands.sort(compareTimestampAscending("requestedAt"))[0];
    if (!nextCommand) {
      return {
        command: null,
      };
    }

    await ctx.db.patch(nextCommand._id, {
      lastFetchedAt: now,
      fetchCount: readNumber(nextCommand.fetchCount, 0) + 1,
      updatedAt: now,
    });

    const patchedCommand = await ctx.db.get(nextCommand._id);
    if (!patchedCommand) {
      return { command: null };
    }

    return {
      command: toPiControlCommandView(patchedCommand),
    };
  },
});

export const acknowledgePiControlCommand = mutationGeneric({
  args: {
    commandId: v.string(),
    status: v.union(v.literal("applied"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const commandDoc = await findPiControlCommandDocByCommandId(ctx, args.commandId);
    if (!commandDoc) {
      throw new Error(`Unknown command id: ${args.commandId}`);
    }

    const now = nowIsoString();
    await ctx.db.patch(commandDoc._id, {
      status: args.status,
      appliedAt: args.status === "applied" ? now : commandDoc.appliedAt,
      failedAt: args.status === "failed" ? now : commandDoc.failedAt,
      errorMessage: args.status === "failed" ? args.errorMessage : undefined,
      updatedAt: now,
    });

    const patchedCommand = await ctx.db.get(commandDoc._id);
    if (!patchedCommand) {
      throw new Error(`Unable to load command after acknowledge: ${args.commandId}`);
    }

    return toPiControlCommandView(patchedCommand);
  },
});

export const startSession = mutationGeneric({
  args: {
    title: v.string(),
    deviceId: v.string(),
    startedAt: v.string(),
    classroomLabel: v.optional(v.string()),
    clientSessionId: v.optional(v.string()),
    deviceIpAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionId = args.clientSessionId?.trim() || `session_${Date.now()}`;
    const now = nowIsoString();
    const existing = await findSessionDocBySessionId(ctx, sessionId);

    let sessionDocId = existing?._id;
    if (sessionDocId) {
      await ctx.db.patch(sessionDocId, {
        title: args.title,
        startedAt: args.startedAt,
        status: "capturing",
        deviceId: args.deviceId,
        deviceIpAddress: args.deviceIpAddress,
        classroomLabel: args.classroomLabel,
        updatedAt: now,
      });
    } else {
      sessionDocId = await ctx.db.insert("sessions", {
        sessionId,
        deviceIpAddress: args.deviceIpAddress,
        title: args.title,
        startedAt: args.startedAt,
        status: "capturing",
        deviceId: args.deviceId,
        classroomLabel: args.classroomLabel,
        createdAt: now,
        updatedAt: now,
        uncertaintyFlags: [],
      });
    }

    await insertUploadReceipt(ctx, {
      sessionId,
      kind: "session_event",
      entityId: sessionId,
      status: "accepted",
      message: "Session start accepted by cloud API.",
    });

    const sessionDoc = await ctx.db.get(sessionDocId);
    if (!sessionDoc) {
      throw new Error(`Unable to load session after start: ${sessionId}`);
    }

    const modeWindowDocs = await listModeWindows(ctx, sessionId);
    return {
      session: toSessionView(sessionDoc, modeWindowDocs),
    };
  },
});

export const renameSession = mutationGeneric({
  args: {
    sessionId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await requireSessionDocBySessionId(ctx, args.sessionId);
    const nextTitle = args.title.trim();
    if (!nextTitle) {
      throw new Error("Session title cannot be empty.");
    }

    await ctx.db.patch(sessionDoc._id, {
      title: nextTitle,
      updatedAt: nowIsoString(),
    });

    const updatedDoc = await ctx.db.get(sessionDoc._id);
    if (!updatedDoc) {
      throw new Error(`Unable to load session after rename: ${args.sessionId}`);
    }

    const modeWindowDocs = await listModeWindows(ctx, args.sessionId);
    return {
      session: toSessionView(updatedDoc, modeWindowDocs),
    };
  },
});

export const recordAudioUpload = mutationGeneric({
  args: {
    sessionId: v.string(),
    audioChunk: v.any(),
    artifact: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await requireSessionDocBySessionId(ctx, args.sessionId);
    const audioChunkId = readString(args.audioChunk?.id);
    if (!audioChunkId) {
      throw new Error("Audio chunk id is required.");
    }

    const existing = await ctx.db
      .query("audioChunks")
      .withIndex("by_chunk_id", (q) => q.eq("audioChunkId", audioChunkId))
      .first();
    if (existing) {
      return {
        audioChunk: toAudioChunkView(existing),
        receipt: await insertUploadReceipt(ctx, {
          sessionId: args.sessionId,
          kind: "audio",
          entityId: audioChunkId,
          status: "duplicate",
          storageKey: readString(existing.storageKey),
          message: "Audio chunk id already exists in this session.",
        }),
      };
    }

    const uploadedAt = nowIsoString();
    await ctx.db.insert("audioChunks", {
      audioChunkId,
      sessionId: args.sessionId,
      sequenceNumber: readNumber(args.audioChunk?.sequenceNumber, 0),
      capturedAt: readString(args.audioChunk?.capturedAt) ?? uploadedAt,
      durationMs: readNumber(args.audioChunk?.durationMs, 0),
      sampleRateHz: readNumber(args.audioChunk?.sampleRateHz, 16000),
      channels: readNumber(args.audioChunk?.channels, 1),
      uploadStatus: "uploaded",
      localPath: readString(args.audioChunk?.localPath),
      storageKey:
        readString(args.artifact?.storageKey) ?? readString(args.audioChunk?.storageKey),
      uploadedAt,
      checksumSha256: readString(args.audioChunk?.checksumSha256),
      uncertaintyFlags: coerceArray(args.audioChunk?.uncertaintyFlags),
    });

    await ctx.db.patch(sessionDoc._id, {
      status: "capturing",
      updatedAt: uploadedAt,
    });

    const storedChunk = await ctx.db
      .query("audioChunks")
      .withIndex("by_chunk_id", (q) => q.eq("audioChunkId", audioChunkId))
      .first();
    if (!storedChunk) {
      throw new Error(`Unable to load audio chunk after insert: ${audioChunkId}`);
    }

    return {
      audioChunk: toAudioChunkView(storedChunk),
      receipt: await insertUploadReceipt(ctx, {
        sessionId: args.sessionId,
        kind: "audio",
        entityId: audioChunkId,
        status: "accepted",
        storageKey: readString(storedChunk.storageKey),
        message: "Audio chunk accepted by cloud API.",
      }),
    };
  },
});

export const recordImageUpload = mutationGeneric({
  args: {
    sessionId: v.string(),
    capturedImage: v.any(),
    artifact: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await requireSessionDocBySessionId(ctx, args.sessionId);
    const imageId = readString(args.capturedImage?.id);
    if (!imageId) {
      throw new Error("Captured image id is required.");
    }

    const existing = await ctx.db
      .query("capturedImages")
      .withIndex("by_image_id", (q) => q.eq("imageId", imageId))
      .first();
    if (existing) {
      return {
        capturedImage: toCapturedImageView(existing),
        receipt: await insertUploadReceipt(ctx, {
          sessionId: args.sessionId,
          kind: "image",
          entityId: imageId,
          status: "duplicate",
          storageKey: readString(existing.storageKey),
          message: "Image id already exists in this session.",
        }),
      };
    }

    const uploadedAt = nowIsoString();
    await ctx.db.insert("capturedImages", {
      imageId,
      sessionId: args.sessionId,
      sequenceNumber: readNumber(args.capturedImage?.sequenceNumber, 0),
      capturedAt: readString(args.capturedImage?.capturedAt) ?? uploadedAt,
      acceptedForProcessing: readBoolean(args.capturedImage?.acceptedForProcessing, true),
      localPath: readString(args.capturedImage?.localPath),
      storageKey:
        readString(args.artifact?.storageKey) ?? readString(args.capturedImage?.storageKey),
      uploadedAt,
      diffScore: readOptionalNumber(args.capturedImage?.diffScore),
      blurScore: readOptionalNumber(args.capturedImage?.blurScore),
      qualityScore: readOptionalNumber(args.capturedImage?.qualityScore),
      modeHint: readString(args.capturedImage?.modeHint),
      transcriptAnchor: readObject(args.capturedImage?.transcriptAnchor),
      nearbyTranscriptSegmentIds: coerceStringArray(args.capturedImage?.nearbyTranscriptSegmentIds),
      uncertaintyFlags: coerceArray(args.capturedImage?.uncertaintyFlags),
    });

    await ctx.db.patch(sessionDoc._id, {
      status: "capturing",
      updatedAt: uploadedAt,
    });

    const storedImage = await ctx.db
      .query("capturedImages")
      .withIndex("by_image_id", (q) => q.eq("imageId", imageId))
      .first();
    if (!storedImage) {
      throw new Error(`Unable to load image after insert: ${imageId}`);
    }

    return {
      capturedImage: toCapturedImageView(storedImage),
      receipt: await insertUploadReceipt(ctx, {
        sessionId: args.sessionId,
        kind: "image",
        entityId: imageId,
        status: "accepted",
        storageKey: readString(storedImage.storageKey),
        message: "Image accepted by cloud API.",
      }),
    };
  },
});

export const recordHeartbeat = mutationGeneric({
  args: {
    sessionId: v.string(),
    observedAt: v.string(),
    queuedUploadCount: v.optional(v.number()),
    lastAudioSequenceNumber: v.optional(v.number()),
    lastImageSequenceNumber: v.optional(v.number()),
    runtimeStatus: v.optional(v.string()),
    deviceIpAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await requireSessionDocBySessionId(ctx, args.sessionId);
    const receivedAt = nowIsoString();
    const status =
      sessionDoc.status === "pending" || sessionDoc.status === "uploading"
        ? "capturing"
        : sessionDoc.status;

    await ctx.db.patch(sessionDoc._id, {
      status,
      updatedAt: receivedAt,
      deviceIpAddress: args.deviceIpAddress || sessionDoc.deviceIpAddress,
    });

    return {
      sessionId: args.sessionId,
      receivedAt,
      status,
    };
  },
});

export const endSession = mutationGeneric({
  args: {
    sessionId: v.string(),
    endedAt: v.string(),
    stopReason: v.optional(v.string()),
    lastAudioSequenceNumber: v.optional(v.number()),
    lastImageSequenceNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await requireSessionDocBySessionId(ctx, args.sessionId);
    const updatedAt = nowIsoString();

    await ctx.db.patch(sessionDoc._id, {
      endedAt: args.endedAt,
      updatedAt,
      status: "processing",
      processingJobStatus: "queued",
    });

    const receipt = await insertUploadReceipt(ctx, {
      sessionId: args.sessionId,
      kind: "session_event",
      entityId: args.sessionId,
      status: "accepted",
      message: args.stopReason
        ? `Session end accepted by cloud API: ${args.stopReason}`
        : "Session end accepted by cloud API.",
    });

    // TODO(convex-processing-handoff): Schedule the existing cloud-processing worker
    // pipeline from here once durable artifact storage and UploadThing handoff are wired.
    const patchedSessionDoc = await ctx.db.get(sessionDoc._id);
    if (!patchedSessionDoc) {
      throw new Error(`Unable to load session after end: ${args.sessionId}`);
    }

    const modeWindowDocs = await listModeWindows(ctx, args.sessionId);
    return {
      session: toSessionView(patchedSessionDoc, modeWindowDocs),
      receipt,
    };
  },
});

export const markProcessingRunning = mutationGeneric({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await requireSessionDocBySessionId(ctx, args.sessionId);
    const updatedAt = nowIsoString();

    await ctx.db.patch(sessionDoc._id, {
      status: "processing",
      processingJobStatus: "running",
      updatedAt,
    });

    const patchedSessionDoc = await ctx.db.get(sessionDoc._id);
    if (!patchedSessionDoc) {
      throw new Error(`Unable to load session after marking processing running: ${args.sessionId}`);
    }

    const modeWindowDocs = await listModeWindows(ctx, args.sessionId);
    return {
      session: toSessionView(patchedSessionDoc, modeWindowDocs),
    };
  },
});

export const markProcessingFailed = mutationGeneric({
  args: {
    sessionId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await requireSessionDocBySessionId(ctx, args.sessionId);
    const updatedAt = nowIsoString();
    const uncertaintyFlags = dedupeUncertaintyFlags([
      ...coerceArray(sessionDoc.uncertaintyFlags),
      {
        kind: "session-processing-failed",
        severity: "high",
        message: args.error,
        source: "processing",
        relatedId: args.sessionId,
        createdAt: updatedAt,
      },
    ]);

    await ctx.db.patch(sessionDoc._id, {
      status: "failed",
      processingJobStatus: "failed",
      updatedAt,
      uncertaintyFlags,
    });

    const patchedSessionDoc = await ctx.db.get(sessionDoc._id);
    if (!patchedSessionDoc) {
      throw new Error(`Unable to load session after marking processing failed: ${args.sessionId}`);
    }

    const modeWindowDocs = await listModeWindows(ctx, args.sessionId);
    return {
      session: toSessionView(patchedSessionDoc, modeWindowDocs),
    };
  },
});

export const applyProcessingResult = mutationGeneric({
  args: {
    sessionId: v.string(),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await requireSessionDocBySessionId(ctx, args.sessionId);
    const normalizedResult = normalizeProcessingResult(args.sessionId, args.result);
    const updatedAt = nowIsoString();
    const suggestedTitle = buildSuggestedTitleFromTranscript(
      normalizedResult.transcriptSegments,
    );

    await clearDerivedSessionArtifacts(ctx, args.sessionId);

    for (const transcriptSegment of normalizedResult.transcriptSegments) {
      await ctx.db.insert("transcriptSegments", {
        transcriptSegmentId: transcriptSegment.id,
        sessionId: args.sessionId,
        chunkId: transcriptSegment.chunkId,
        startMs: transcriptSegment.startMs,
        endMs: transcriptSegment.endMs,
        text: transcriptSegment.text,
        sourceModel: transcriptSegment.sourceModel,
        confidence: transcriptSegment.confidence,
        speakerId: transcriptSegment.speakerId,
        isPrimarySpeaker: transcriptSegment.isPrimarySpeaker,
        linkedImageIds: transcriptSegment.linkedImageIds,
        uncertaintyFlags: transcriptSegment.uncertaintyFlags,
      });
    }

    for (const speakerSegment of normalizedResult.speakerSegments) {
      await ctx.db.insert("speakerSegments", {
        speakerSegmentId: speakerSegment.id,
        sessionId: args.sessionId,
        startMs: speakerSegment.startMs,
        endMs: speakerSegment.endMs,
        speakerLabel: speakerSegment.speakerLabel,
        confidence: speakerSegment.confidence,
        isPrimaryCandidate: speakerSegment.isPrimaryCandidate,
        uncertaintyFlags: speakerSegment.uncertaintyFlags,
      });
    }

    for (const ocrResult of normalizedResult.ocrResults) {
      await ctx.db.insert("ocrResults", {
        ocrResultId: ocrResult.id,
        imageId: ocrResult.imageId,
        text: ocrResult.text,
        engine: ocrResult.engine,
        blocks: ocrResult.blocks,
        confidence: ocrResult.confidence,
        transcriptAnchor: ocrResult.transcriptAnchor,
        nearbyTranscriptSegmentIds: ocrResult.nearbyTranscriptSegmentIds,
        uncertaintyFlags: ocrResult.uncertaintyFlags,
      });
    }

    for (const visionResult of normalizedResult.visionResults) {
      await ctx.db.insert("visionResults", {
        visionResultId: visionResult.id,
        imageId: visionResult.imageId,
        model: visionResult.model,
        summary: visionResult.summary,
        extractedTextCues: visionResult.extractedTextCues,
        supportingOcrBlockIds: visionResult.supportingOcrBlockIds,
        sceneType: visionResult.sceneType,
        confidence: visionResult.confidence,
        transcriptAnchor: visionResult.transcriptAnchor,
        nearbyTranscriptSegmentIds: visionResult.nearbyTranscriptSegmentIds,
        uncertaintyFlags: visionResult.uncertaintyFlags,
      });
    }

    for (const modeWindow of normalizedResult.modeWindows) {
      await ctx.db.insert("modeWindows", modeWindow);
    }

    const finalNotes = buildFinalNotes(args.sessionId, normalizedResult, updatedAt);
    await ctx.db.insert("finalNotes", {
      finalNotesId: finalNotes.id,
      sessionId: args.sessionId,
      createdAt: finalNotes.createdAt,
      updatedAt: finalNotes.updatedAt,
      sections: finalNotes.sections,
      modeWindows: finalNotes.modeWindows,
      transcriptSegmentIds: finalNotes.transcriptSegmentIds,
      imageIds: finalNotes.imageIds,
      uncertaintyFlags: finalNotes.uncertaintyFlags,
    });

    const sessionPatch: Record<string, unknown> = {
      status: "complete",
      processingJobStatus: "completed",
      updatedAt,
      primarySpeakerLabel: normalizedResult.primarySpeakerLabel,
      finalNotesId: finalNotes.id,
      uncertaintyFlags: dedupeUncertaintyFlags([
        ...coerceArray(sessionDoc.uncertaintyFlags),
        ...normalizedResult.uncertaintyFlags,
      ]),
    };

    if (suggestedTitle) {
      sessionPatch.suggestedTitle = suggestedTitle;

      const currentTitle = normalizeWhitespace(readString(sessionDoc.title));
      if (isPlaceholderSessionTitle(currentTitle)) {
        sessionPatch.title = suggestedTitle;
      }
    }

    await ctx.db.patch(sessionDoc._id, sessionPatch);

    const patchedSessionDoc = await ctx.db.get(sessionDoc._id);
    if (!patchedSessionDoc) {
      throw new Error(`Unable to load session after applying processing result: ${args.sessionId}`);
    }

    const modeWindowDocs = await listModeWindows(ctx, args.sessionId);
    return {
      session: toSessionView(patchedSessionDoc, modeWindowDocs),
    };
  },
});

async function requireSessionDocBySessionId(
  ctx: any,
  sessionId: string,
): Promise<Record<string, any>> {
  const sessionDoc = await findSessionDocBySessionId(ctx, sessionId);
  if (!sessionDoc) {
    throw new Error(`Unknown session id: ${sessionId}`);
  }
  return sessionDoc;
}

async function findPiDeviceDocByDeviceId(
  ctx: any,
  deviceId: string,
): Promise<Record<string, any> | null> {
  return await ctx.db
    .query("piDevices")
    .withIndex("by_device_id", (q: any) => q.eq("deviceId", deviceId))
    .first();
}

async function upsertPiDevicePresence(
  ctx: any,
  input: {
    deviceId: string;
    runtimeStatus?: string;
    activeSessionId?: string;
    deviceIpAddress?: string;
    observedAt: string;
  },
): Promise<void> {
  const existing = await findPiDeviceDocByDeviceId(ctx, input.deviceId);
  if (existing) {
    await ctx.db.patch(existing._id, {
      lastSeenAt: input.observedAt,
      lastCommandPollAt: input.observedAt,
      runtimeStatus: input.runtimeStatus ?? existing.runtimeStatus,
      activeSessionId: input.activeSessionId,
      deviceIpAddress: input.deviceIpAddress ?? existing.deviceIpAddress,
      updatedAt: input.observedAt,
    });
    return;
  }

  await ctx.db.insert("piDevices", {
    deviceId: input.deviceId,
    lastSeenAt: input.observedAt,
    lastCommandPollAt: input.observedAt,
    runtimeStatus: input.runtimeStatus,
    activeSessionId: input.activeSessionId,
    deviceIpAddress: input.deviceIpAddress,
    updatedAt: input.observedAt,
  });
}

async function findPiControlCommandDocByCommandId(
  ctx: any,
  commandId: string,
): Promise<Record<string, any> | null> {
  return await ctx.db
    .query("piControlCommands")
    .withIndex("by_command_id", (q: any) => q.eq("commandId", commandId))
    .first();
}

async function findSessionDocBySessionId(
  ctx: any,
  sessionId: string,
): Promise<Record<string, any> | null> {
  return await ctx.db
    .query("sessions")
    .withIndex("by_session_id", (q: any) => q.eq("sessionId", sessionId))
    .first();
}

async function findFinalNotes(ctx: any, sessionId: string): Promise<Record<string, any> | null> {
  return await ctx.db
    .query("finalNotes")
    .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
    .first();
}

async function listAudioChunks(ctx: any, sessionId: string): Promise<Record<string, any>[]> {
  const docs = await ctx.db
    .query("audioChunks")
    .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
    .collect();
  return docs.sort(compareSequenceAscending("sequenceNumber"));
}

async function listTranscriptSegments(
  ctx: any,
  sessionId: string,
): Promise<Record<string, any>[]> {
  const docs = await ctx.db
    .query("transcriptSegments")
    .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
    .collect();
  return docs.sort(compareNumberAscending("startMs"));
}

async function listSpeakerSegments(ctx: any, sessionId: string): Promise<Record<string, any>[]> {
  const docs = await ctx.db
    .query("speakerSegments")
    .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
    .collect();
  return docs.sort(compareNumberAscending("startMs"));
}

async function listCapturedImages(ctx: any, sessionId: string): Promise<Record<string, any>[]> {
  const docs = await ctx.db
    .query("capturedImages")
    .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
    .collect();
  return docs.sort(compareSequenceAscending("sequenceNumber"));
}

async function listModeWindows(ctx: any, sessionId: string): Promise<Record<string, any>[]> {
  const docs = await ctx.db
    .query("modeWindows")
    .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
    .collect();
  return docs.sort(compareNumberAscending("startMs"));
}

async function listUploadReceipts(ctx: any, sessionId: string): Promise<Record<string, any>[]> {
  const docs = await ctx.db
    .query("uploadReceipts")
    .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
    .collect();
  return docs.sort(compareTimestampAscending("receivedAt"));
}

async function listOcrResults(ctx: any, imageIds: string[]): Promise<Record<string, any>[]> {
  const docs = await Promise.all(
    imageIds.map(async (imageId) => {
      return await ctx.db
        .query("ocrResults")
        .withIndex("by_image", (q: any) => q.eq("imageId", imageId))
        .collect();
    }),
  );
  return docs.flat();
}

async function listVisionResults(ctx: any, imageIds: string[]): Promise<Record<string, any>[]> {
  const docs = await Promise.all(
    imageIds.map(async (imageId) => {
      return await ctx.db
        .query("visionResults")
        .withIndex("by_image", (q: any) => q.eq("imageId", imageId))
        .collect();
    }),
  );
  return docs.flat();
}

async function clearDerivedSessionArtifacts(ctx: any, sessionId: string): Promise<void> {
  const [
    transcriptSegmentDocs,
    speakerSegmentDocs,
    modeWindowDocs,
    finalNotesDocs,
    capturedImageDocs,
  ] = await Promise.all([
    listTranscriptSegments(ctx, sessionId),
    listSpeakerSegments(ctx, sessionId),
    listModeWindows(ctx, sessionId),
    ctx.db
      .query("finalNotes")
      .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
      .collect(),
    listCapturedImages(ctx, sessionId),
  ]);

  for (const transcriptSegmentDoc of transcriptSegmentDocs) {
    await ctx.db.delete(transcriptSegmentDoc._id);
  }
  for (const speakerSegmentDoc of speakerSegmentDocs) {
    await ctx.db.delete(speakerSegmentDoc._id);
  }
  for (const modeWindowDoc of modeWindowDocs) {
    await ctx.db.delete(modeWindowDoc._id);
  }
  for (const finalNotesDoc of finalNotesDocs) {
    await ctx.db.delete(finalNotesDoc._id);
  }

  const imageIds = capturedImageDocs
    .map((capturedImageDoc) => readString(capturedImageDoc.imageId))
    .filter((imageId): imageId is string => typeof imageId === "string");
  const [ocrResultDocs, visionResultDocs] = await Promise.all([
    listOcrResults(ctx, imageIds),
    listVisionResults(ctx, imageIds),
  ]);

  for (const ocrResultDoc of ocrResultDocs) {
    await ctx.db.delete(ocrResultDoc._id);
  }
  for (const visionResultDoc of visionResultDocs) {
    await ctx.db.delete(visionResultDoc._id);
  }
}

async function insertUploadReceipt(
  ctx: any,
  input: {
    sessionId: string;
    kind: string;
    entityId: string;
    status: string;
    storageKey?: string;
    message?: string;
  },
) {
  const receivedAt = nowIsoString();
  const uploadReceiptId = [
    "receipt",
    input.kind,
    input.entityId,
    receivedAt.replace(/[^0-9]+/g, ""),
    Math.random().toString(36).slice(2, 8),
  ].join("_");

  await ctx.db.insert("uploadReceipts", {
    uploadReceiptId,
    sessionId: input.sessionId,
    kind: input.kind,
    entityId: input.entityId,
    status: input.status,
    receivedAt,
    acknowledgedAt: receivedAt,
    storageKey: input.storageKey,
    message: input.message,
    uncertaintyFlags: [],
  });

  return {
    id: uploadReceiptId,
    sessionId: input.sessionId,
    kind: input.kind,
    entityId: input.entityId,
    status: input.status,
    receivedAt,
    acknowledgedAt: receivedAt,
    storageKey: input.storageKey,
    message: input.message,
    uncertaintyFlags: [],
  };
}

function toSessionView(sessionDoc: Record<string, any>, modeWindowDocs: Record<string, any>[]) {
  return {
    id: sessionDoc.sessionId,
    title: sessionDoc.title,
    suggestedTitle: sessionDoc.suggestedTitle,
    startedAt: sessionDoc.startedAt,
    status: sessionDoc.status,
    deviceId: sessionDoc.deviceId,
    deviceIpAddress: sessionDoc.deviceIpAddress,
    classroomLabel: sessionDoc.classroomLabel,
    endedAt: sessionDoc.endedAt,
    createdAt: sessionDoc.createdAt,
    updatedAt: sessionDoc.updatedAt,
    primarySpeakerLabel: sessionDoc.primarySpeakerLabel,
    processingJobStatus: sessionDoc.processingJobStatus,
    finalNotesId: sessionDoc.finalNotesId,
    modeWindows: modeWindowDocs.map(toModeWindowView),
    uncertaintyFlags: coerceArray(sessionDoc.uncertaintyFlags),
  };
}

function toAudioChunkView(audioChunkDoc: Record<string, any>) {
  return {
    id: audioChunkDoc.audioChunkId,
    sessionId: audioChunkDoc.sessionId,
    sequenceNumber: audioChunkDoc.sequenceNumber,
    capturedAt: audioChunkDoc.capturedAt,
    durationMs: audioChunkDoc.durationMs,
    sampleRateHz: audioChunkDoc.sampleRateHz,
    channels: audioChunkDoc.channels,
    uploadStatus: audioChunkDoc.uploadStatus,
    localPath: audioChunkDoc.localPath,
    storageKey: audioChunkDoc.storageKey,
    uploadedAt: audioChunkDoc.uploadedAt,
    checksumSha256: audioChunkDoc.checksumSha256,
    uncertaintyFlags: coerceArray(audioChunkDoc.uncertaintyFlags),
  };
}

function toTranscriptSegmentView(transcriptSegmentDoc: Record<string, any>) {
  return {
    id: transcriptSegmentDoc.transcriptSegmentId,
    sessionId: transcriptSegmentDoc.sessionId,
    chunkId: transcriptSegmentDoc.chunkId,
    startMs: transcriptSegmentDoc.startMs,
    endMs: transcriptSegmentDoc.endMs,
    text: transcriptSegmentDoc.text,
    sourceModel: transcriptSegmentDoc.sourceModel,
    confidence: transcriptSegmentDoc.confidence,
    speakerId: transcriptSegmentDoc.speakerId,
    isPrimarySpeaker: transcriptSegmentDoc.isPrimarySpeaker,
    linkedImageIds: coerceStringArray(transcriptSegmentDoc.linkedImageIds),
    uncertaintyFlags: coerceArray(transcriptSegmentDoc.uncertaintyFlags),
  };
}

function toSpeakerSegmentView(speakerSegmentDoc: Record<string, any>) {
  return {
    id: speakerSegmentDoc.speakerSegmentId,
    sessionId: speakerSegmentDoc.sessionId,
    startMs: speakerSegmentDoc.startMs,
    endMs: speakerSegmentDoc.endMs,
    speakerLabel: speakerSegmentDoc.speakerLabel,
    confidence: speakerSegmentDoc.confidence,
    isPrimaryCandidate: speakerSegmentDoc.isPrimaryCandidate,
    uncertaintyFlags: coerceArray(speakerSegmentDoc.uncertaintyFlags),
  };
}

function toCapturedImageView(capturedImageDoc: Record<string, any>) {
  return {
    id: capturedImageDoc.imageId,
    sessionId: capturedImageDoc.sessionId,
    sequenceNumber: capturedImageDoc.sequenceNumber,
    capturedAt: capturedImageDoc.capturedAt,
    acceptedForProcessing: capturedImageDoc.acceptedForProcessing,
    localPath: capturedImageDoc.localPath,
    storageKey: capturedImageDoc.storageKey,
    uploadedAt: capturedImageDoc.uploadedAt,
    diffScore: capturedImageDoc.diffScore,
    blurScore: capturedImageDoc.blurScore,
    qualityScore: capturedImageDoc.qualityScore,
    modeHint: capturedImageDoc.modeHint,
    transcriptAnchor: capturedImageDoc.transcriptAnchor,
    nearbyTranscriptSegmentIds: coerceStringArray(capturedImageDoc.nearbyTranscriptSegmentIds),
    uncertaintyFlags: coerceArray(capturedImageDoc.uncertaintyFlags),
  };
}

function toOcrResultView(ocrResultDoc: Record<string, any>) {
  return {
    id: ocrResultDoc.ocrResultId,
    imageId: ocrResultDoc.imageId,
    text: ocrResultDoc.text,
    engine: ocrResultDoc.engine,
    blocks: coerceArray(ocrResultDoc.blocks),
    confidence: ocrResultDoc.confidence,
    transcriptAnchor: ocrResultDoc.transcriptAnchor,
    nearbyTranscriptSegmentIds: coerceStringArray(ocrResultDoc.nearbyTranscriptSegmentIds),
    uncertaintyFlags: coerceArray(ocrResultDoc.uncertaintyFlags),
  };
}

function toVisionResultView(visionResultDoc: Record<string, any>) {
  return {
    id: visionResultDoc.visionResultId,
    imageId: visionResultDoc.imageId,
    model: visionResultDoc.model,
    summary: visionResultDoc.summary,
    extractedTextCues: coerceStringArray(visionResultDoc.extractedTextCues),
    supportingOcrBlockIds: coerceStringArray(visionResultDoc.supportingOcrBlockIds),
    sceneType: visionResultDoc.sceneType,
    confidence: visionResultDoc.confidence,
    transcriptAnchor: visionResultDoc.transcriptAnchor,
    nearbyTranscriptSegmentIds: coerceStringArray(visionResultDoc.nearbyTranscriptSegmentIds),
    uncertaintyFlags: coerceArray(visionResultDoc.uncertaintyFlags),
  };
}

function toModeWindowView(modeWindowDoc: Record<string, any>) {
  return {
    id: modeWindowDoc.id,
    sessionId: modeWindowDoc.sessionId,
    startMs: modeWindowDoc.startMs,
    endMs: modeWindowDoc.endMs,
    mode: modeWindowDoc.mode,
    rationale: modeWindowDoc.rationale,
    confidence: modeWindowDoc.confidence,
    transcriptSegmentIds: coerceStringArray(modeWindowDoc.transcriptSegmentIds),
    imageIds: coerceStringArray(modeWindowDoc.imageIds),
    uncertaintyFlags: coerceArray(modeWindowDoc.uncertaintyFlags),
  };
}

function toFinalNotesView(finalNotesDoc: Record<string, any>) {
  return {
    id: finalNotesDoc.finalNotesId,
    sessionId: finalNotesDoc.sessionId,
    createdAt: finalNotesDoc.createdAt,
    sections: coerceArray(finalNotesDoc.sections),
    modeWindows: coerceArray(finalNotesDoc.modeWindows),
    transcriptSegmentIds: coerceStringArray(finalNotesDoc.transcriptSegmentIds),
    imageIds: coerceStringArray(finalNotesDoc.imageIds),
    updatedAt: finalNotesDoc.updatedAt,
    uncertaintyFlags: coerceArray(finalNotesDoc.uncertaintyFlags),
  };
}

function toUploadReceiptView(uploadReceiptDoc: Record<string, any>) {
  return {
    id: uploadReceiptDoc.uploadReceiptId,
    sessionId: uploadReceiptDoc.sessionId,
    kind: uploadReceiptDoc.kind,
    entityId: uploadReceiptDoc.entityId,
    status: uploadReceiptDoc.status,
    receivedAt: uploadReceiptDoc.receivedAt,
    acknowledgedAt: uploadReceiptDoc.acknowledgedAt,
    storageKey: uploadReceiptDoc.storageKey,
    message: uploadReceiptDoc.message,
    uncertaintyFlags: coerceArray(uploadReceiptDoc.uncertaintyFlags),
  };
}

function toPiControlCommandView(commandDoc: Record<string, any>) {
  return {
    commandId: commandDoc.commandId,
    deviceId: commandDoc.deviceId,
    commandType: commandDoc.commandType,
    status: commandDoc.status,
    requestedAt: commandDoc.requestedAt,
    requestedBy: commandDoc.requestedBy,
    reason: commandDoc.reason,
    lastFetchedAt: commandDoc.lastFetchedAt,
    fetchCount: readNumber(commandDoc.fetchCount, 0),
    appliedAt: commandDoc.appliedAt,
    failedAt: commandDoc.failedAt,
    errorMessage: commandDoc.errorMessage,
    updatedAt: commandDoc.updatedAt,
  };
}

function buildFinalNotes(
  sessionId: string,
  result: ReturnType<typeof normalizeProcessingResult>,
  createdAt: string,
) {
  const uncertaintyFlags = dedupeUncertaintyFlags([
    ...result.uncertaintyFlags,
    ...result.notes.flatMap((noteSection) => noteSection.uncertaintyFlags),
    ...result.modeWindows.flatMap((modeWindow) => modeWindow.uncertaintyFlags),
  ]);

  return {
    id: `final_notes_${sessionId}`,
    sessionId,
    createdAt,
    updatedAt: createdAt,
    sections: result.notes,
    modeWindows: result.modeWindows,
    transcriptSegmentIds: result.transcriptSegments.map((segment) => segment.id),
    imageIds: result.visualContexts.map((context) => context.imageId),
    uncertaintyFlags,
  };
}

function buildSuggestedTitleFromTranscript(
  transcriptSegments: Array<{ text: string }>,
): string | undefined {
  const evidenceText = transcriptSegments
    .map((segment) => normalizeWhitespace(segment.text))
    .filter((text) => text.length > 0)
    .slice(0, 10)
    .join(" ");

  if (!evidenceText) {
    return undefined;
  }

  const firstSentence = evidenceText.split(/(?<=[.!?])\s+/)[0] ?? evidenceText;
  const cleanedSentence = normalizeWhitespace(
    firstSentence.replace(/[\u2018\u2019]/g, "'").replace(/[^\w\s'\-]/g, " "),
  );
  if (!cleanedSentence) {
    return undefined;
  }

  const words = cleanedSentence
    .split(" ")
    .map((word) => normalizeWhitespace(word))
    .filter((word) => word.length > 0);

  const leadingFillers = new Set([
    "ok",
    "okay",
    "so",
    "um",
    "uh",
    "well",
    "alright",
    "right",
    "today",
  ]);

  while (words.length > 3 && leadingFillers.has(words[0].toLowerCase())) {
    words.shift();
  }

  if (words.length < 3) {
    return undefined;
  }

  const cappedWords = words.slice(0, 10);
  return toTitleCase(cappedWords.join(" "));
}

function normalizeWhitespace(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function isPlaceholderSessionTitle(value: string | undefined): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized === "class session" || normalized.startsWith("class session ");
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function normalizeProcessingResult(sessionId: string, result: unknown) {
  const record = isRecord(result) ? result : {};

  const transcriptSegments = coerceUnknownArray(record.transcriptSegments).map((segment, index) =>
    normalizeTranscriptSegment(sessionId, segment, index),
  );
  const speakerSegments = coerceUnknownArray(record.speakerSegments).map((segment, index) =>
    normalizeSpeakerSegment(sessionId, segment, index),
  );
  const ocrResults = coerceUnknownArray(record.ocrResults).map((ocrResult, index) =>
    normalizeOcrResult(ocrResult, index),
  );
  const visionResults = coerceUnknownArray(record.visionResults).map((visionResult, index) =>
    normalizeVisionResult(visionResult, index),
  );
  const modeWindows = coerceUnknownArray(record.modeWindows).map((modeWindow, index) =>
    normalizeModeWindow(sessionId, modeWindow, index),
  );
  const notes = coerceUnknownArray(record.notes).map((noteSection, index) =>
    normalizeNoteSection(sessionId, noteSection, index),
  );
  const visualContexts = coerceUnknownArray(record.visualContexts).map((visualContext, index) =>
    normalizeVisualContext(sessionId, visualContext, index),
  );

  return {
    transcriptSegments,
    speakerSegments,
    primarySpeakerLabel: readString(record.primarySpeakerLabel),
    ocrResults,
    visionResults,
    visualContexts,
    modeWindows,
    notes,
    uncertaintyFlags: coerceArray(record.uncertaintyFlags),
  };
}

function compareStartedAtDesc(
  left: Record<string, any>,
  right: Record<string, any>,
): number {
  return Date.parse(readString(right.startedAt) ?? "") - Date.parse(readString(left.startedAt) ?? "");
}

function compareSequenceAscending(field: string) {
  return (left: Record<string, any>, right: Record<string, any>) =>
    readNumber(left[field], 0) - readNumber(right[field], 0);
}

function compareNumberAscending(field: string) {
  return (left: Record<string, any>, right: Record<string, any>) =>
    readNumber(left[field], 0) - readNumber(right[field], 0);
}

function compareTimestampAscending(field: string) {
  return (left: Record<string, any>, right: Record<string, any>) =>
    Date.parse(readString(left[field]) ?? "") - Date.parse(readString(right[field]) ?? "");
}

function compareTimestampDescending(field: string) {
  return (left: Record<string, any>, right: Record<string, any>) =>
    Date.parse(readString(right[field]) ?? "") - Date.parse(readString(left[field]) ?? "");
}

function dedupeUncertaintyFlags(flags: unknown[]) {
  const seen = new Set<string>();
  const deduped: Record<string, unknown>[] = [];

  for (const flag of flags) {
    if (!isRecord(flag)) {
      continue;
    }
    const key = [
      readString(flag.kind) ?? "",
      readString(flag.severity) ?? "",
      readString(flag.source) ?? "",
      readString(flag.message) ?? "",
      readString(flag.relatedId) ?? "",
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(flag);
  }

  return deduped;
}

function coerceUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coerceArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function normalizeTranscriptSegment(
  sessionId: string,
  value: unknown,
  index: number,
) {
  const record = isRecord(value) ? value : {};
  return {
    id: readString(record.id) ?? `transcript_${sessionId}_${index + 1}`,
    sessionId,
    chunkId: readString(record.chunkId) ?? `chunk_${index + 1}`,
    startMs: readNumber(record.startMs, 0),
    endMs: readNumber(record.endMs, 0),
    text: readString(record.text) ?? "",
    sourceModel: "parakeet-ctc-v3" as const,
    confidence: readOptionalNumber(record.confidence),
    speakerId: readString(record.speakerId),
    isPrimarySpeaker:
      typeof record.isPrimarySpeaker === "boolean" ? record.isPrimarySpeaker : undefined,
    linkedImageIds: coerceStringArray(record.linkedImageIds),
    uncertaintyFlags: coerceArray(record.uncertaintyFlags),
  };
}

function normalizeSpeakerSegment(
  sessionId: string,
  value: unknown,
  index: number,
) {
  const record = isRecord(value) ? value : {};
  return {
    id: readString(record.id) ?? `speaker_${sessionId}_${index + 1}`,
    sessionId,
    startMs: readNumber(record.startMs, 0),
    endMs: readNumber(record.endMs, 0),
    speakerLabel: readString(record.speakerLabel) ?? `speaker_${index + 1}`,
    confidence: readOptionalNumber(record.confidence),
    isPrimaryCandidate: readBoolean(record.isPrimaryCandidate, false),
    uncertaintyFlags: coerceArray(record.uncertaintyFlags),
  };
}

function normalizeOcrResult(value: unknown, index: number) {
  const record = isRecord(value) ? value : {};
  const blocks = coerceUnknownArray(record.blocks).map((block, blockIndex) => {
    const blockRecord = isRecord(block) ? block : {};
    return {
      id: readString(blockRecord.id) ?? `ocr_block_${index + 1}_${blockIndex + 1}`,
      imageId: readString(blockRecord.imageId) ?? "",
      text: readString(blockRecord.text) ?? "",
      boundingBox: normalizeBoundingBox(blockRecord.boundingBox),
      confidence: readOptionalNumber(blockRecord.confidence),
      lineIndex: readOptionalNumber(blockRecord.lineIndex),
      transcriptAnchor: normalizeTranscriptAnchor(blockRecord.transcriptAnchor),
      uncertaintyFlags: coerceArray(blockRecord.uncertaintyFlags),
    };
  });

  return {
    id: readString(record.id) ?? `ocr_result_${index + 1}`,
    imageId: readString(record.imageId) ?? "",
    text: readString(record.text) ?? "",
    engine: readString(record.engine) ?? "ocr-todo",
    blocks,
    confidence: readOptionalNumber(record.confidence),
    transcriptAnchor: normalizeTranscriptAnchor(record.transcriptAnchor),
    nearbyTranscriptSegmentIds: coerceStringArray(record.nearbyTranscriptSegmentIds),
    uncertaintyFlags: coerceArray(record.uncertaintyFlags),
  };
}

function normalizeVisionResult(value: unknown, index: number) {
  const record = isRecord(value) ? value : {};
  const model = readString(record.model) === "moondream-3" ? "moondream-3" : "moondream-3";

  return {
    id: readString(record.id) ?? `vision_result_${index + 1}`,
    imageId: readString(record.imageId) ?? "",
    model,
    summary: readString(record.summary) ?? "",
    extractedTextCues: coerceStringArray(record.extractedTextCues),
    supportingOcrBlockIds: coerceStringArray(record.supportingOcrBlockIds),
    sceneType: normalizeClassMode(record.sceneType),
    confidence: readOptionalNumber(record.confidence),
    transcriptAnchor: normalizeTranscriptAnchor(record.transcriptAnchor),
    nearbyTranscriptSegmentIds: coerceStringArray(record.nearbyTranscriptSegmentIds),
    uncertaintyFlags: coerceArray(record.uncertaintyFlags),
  };
}

function normalizeModeWindow(
  sessionId: string,
  value: unknown,
  index: number,
) {
  const record = isRecord(value) ? value : {};
  return {
    id: readString(record.id) ?? `mode_${sessionId}_${index + 1}`,
    sessionId,
    startMs: readNumber(record.startMs, 0),
    endMs: readNumber(record.endMs, 0),
    mode: normalizeClassMode(record.mode) ?? "just_talking",
    rationale: readString(record.rationale) ?? "",
    confidence: readOptionalNumber(record.confidence),
    transcriptSegmentIds: coerceStringArray(record.transcriptSegmentIds),
    imageIds: coerceStringArray(record.imageIds),
    uncertaintyFlags: coerceArray(record.uncertaintyFlags),
  };
}

function normalizeNoteSection(
  sessionId: string,
  value: unknown,
  index: number,
) {
  const record = isRecord(value) ? value : {};
  return {
    id: readString(record.id) ?? `note_${sessionId}_${index + 1}`,
    sessionId,
    title: readString(record.title) ?? `Notes ${index + 1}`,
    startMs: readNumber(record.startMs, 0),
    endMs: readNumber(record.endMs, 0),
    content: readString(record.content) ?? "",
    transcriptSegmentIds: coerceStringArray(record.transcriptSegmentIds),
    imageIds: coerceStringArray(record.imageIds),
    ocrResultIds: coerceStringArray(record.ocrResultIds),
    visionResultIds: coerceStringArray(record.visionResultIds),
    mode: normalizeClassMode(record.mode),
    uncertaintyFlags: coerceArray(record.uncertaintyFlags),
  };
}

function normalizeVisualContext(
  sessionId: string,
  value: unknown,
  index: number,
) {
  const record = isRecord(value) ? value : {};
  const evidenceRefs = readObject(record.evidenceRefs);

  return {
    id: readString(record.id) ?? `visual_context_${sessionId}_${index + 1}`,
    sessionId,
    imageId: readString(record.imageId) ?? "",
    modeHint: normalizeClassMode(record.modeHint),
    ocrText: readString(record.ocrText) ?? "",
    visionSummary: readString(record.visionSummary) ?? "",
    transcriptCueSnippets: coerceStringArray(record.transcriptCueSnippets),
    evidenceRefs: {
      ocrResultId: readString(evidenceRefs?.ocrResultId),
      visionResultId: readString(evidenceRefs?.visionResultId),
    },
    uncertaintyFlags: coerceArray(record.uncertaintyFlags),
  };
}

function normalizeBoundingBox(value: unknown) {
  const record = isRecord(value) ? value : {};
  return {
    x: readNumber(record.x, 0),
    y: readNumber(record.y, 0),
    width: readNumber(record.width, 0),
    height: readNumber(record.height, 0),
  };
}

function normalizeTranscriptAnchor(value: unknown) {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return undefined;
  }

  return {
    startMs: readNumber(record.startMs, 0),
    endMs: readNumber(record.endMs, 0),
    transcriptSegmentIds: coerceStringArray(record.transcriptSegmentIds),
  };
}

function normalizeClassMode(value: unknown): "slides" | "handwriting" | "just_talking" | undefined {
  if (value === "slides" || value === "handwriting" || value === "just_talking") {
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nowIsoString(): string {
  return new Date().toISOString();
}
