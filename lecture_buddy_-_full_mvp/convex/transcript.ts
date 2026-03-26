import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptSegments")
      .withIndex("by_session_and_start", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});

// TODO: called by transcription processing job
export const insertBatch = mutation({
  args: {
    sessionId: v.id("sessions"),
    segments: v.array(
      v.object({
        audioChunkId: v.optional(v.id("audioChunks")),
        startOffsetSeconds: v.number(),
        endOffsetSeconds: v.number(),
        text: v.string(),
        confidence: v.optional(v.number()),
        speakerId: v.optional(v.string()),
        language: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const seg of args.segments) {
      await ctx.db.insert("transcriptSegments", {
        sessionId: args.sessionId,
        ...seg,
      });
    }
  },
});
