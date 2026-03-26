import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("noteSections")
      .withIndex("by_session_and_order", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});

export const update = mutation({
  args: {
    noteSectionId: v.id("noteSections"),
    body: v.string(),
    heading: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { noteSectionId, ...updates } = args;
    await ctx.db.patch(noteSectionId, { ...updates, isUserEdited: true });
  },
});

// TODO: this will be called by the note_generation processing job
export const insertGenerated = mutation({
  args: {
    sessionId: v.id("sessions"),
    sections: v.array(
      v.object({
        orderIndex: v.number(),
        heading: v.string(),
        body: v.string(),
        startOffsetSeconds: v.optional(v.number()),
        endOffsetSeconds: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const section of args.sections) {
      await ctx.db.insert("noteSections", {
        sessionId: args.sessionId,
        ...section,
        isUserEdited: false,
      });
    }
  },
});
