import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listBySession = query({
  args: { sessionId: v.id("sessions"), includeResolved: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const flags = await ctx.db
      .query("uncertaintyFlags")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    if (args.includeResolved) return flags;
    return flags.filter((f) => !f.isResolved);
  },
});

export const resolve = mutation({
  args: {
    flagId: v.id("uncertaintyFlags"),
    resolvedNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flagId, {
      isResolved: true,
      resolvedNote: args.resolvedNote,
    });
  },
});

export const flag = mutation({
  args: {
    sessionId: v.id("sessions"),
    kind: v.literal("user_flagged"),
    description: v.string(),
    offsetSeconds: v.optional(v.number()),
    relatedTranscriptId: v.optional(v.id("transcriptSegments")),
    relatedImageId: v.optional(v.id("capturedImages")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("uncertaintyFlags", {
      ...args,
      severity: "medium",
      isResolved: false,
    });
  },
});
