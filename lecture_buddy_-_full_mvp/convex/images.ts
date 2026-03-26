import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("capturedImages")
      .withIndex("by_session_and_offset", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();

    // Attach OCR and vision results
    return await Promise.all(
      images.map(async (img) => {
        const [ocr, vision] = await Promise.all([
          img.ocrResultId ? ctx.db.get(img.ocrResultId) : null,
          img.visionResultId ? ctx.db.get(img.visionResultId) : null,
        ]);
        return { ...img, ocr, vision };
      })
    );
  },
});

// TODO: called by Pi ingest webhook when image is uploaded to UploadThing
export const registerUpload = mutation({
  args: {
    sessionId: v.id("sessions"),
    capturedAtOffset: v.number(),
    capturedAtWall: v.number(),
    uploadthingKey: v.string(),
    uploadthingUrl: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("capturedImages", {
      ...args,
      thumbnailUrl: args.uploadthingUrl, // TODO: generate real thumbnail
    });
  },
});
