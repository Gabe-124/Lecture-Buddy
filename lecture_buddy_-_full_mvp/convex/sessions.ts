import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// List all sessions for a course
export const listByCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .order("desc")
      .collect();
  },
});

// Get a single session with related counts
export const getWithStats = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const [noteSections, transcriptSegments, capturedImages, uncertaintyFlags, processingJobs] =
      await Promise.all([
        ctx.db.query("noteSections").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).collect(),
        ctx.db.query("transcriptSegments").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).collect(),
        ctx.db.query("capturedImages").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).collect(),
        ctx.db.query("uncertaintyFlags").withIndex("by_session_and_resolved", (q) => q.eq("sessionId", args.sessionId).eq("isResolved", false)).collect(),
        ctx.db.query("processingJobs").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).order("desc").take(5),
      ]);

    return {
      ...session,
      stats: {
        noteCount: noteSections.length,
        transcriptCount: transcriptSegments.length,
        imageCount: capturedImages.length,
        unresolvedFlags: uncertaintyFlags.length,
      },
      recentJobs: processingJobs,
    };
  },
});

// Create a new session (called by Pi ingest or manually)
export const create = mutation({
  args: {
    courseId: v.id("courses"),
    deviceId: v.optional(v.id("devices")),
    title: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // TODO: validate device auth token from Pi ingest
    return await ctx.db.insert("sessions", {
      courseId: args.courseId,
      deviceId: args.deviceId,
      title: args.title,
      startedAt: args.startedAt,
      status: "recording",
    });
  },
});

// Update session status
export const updateStatus = mutation({
  args: {
    sessionId: v.id("sessions"),
    status: v.union(
      v.literal("recording"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    endedAt: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    processingProgress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { sessionId, ...updates } = args;
    await ctx.db.patch(sessionId, updates);
  },
});
