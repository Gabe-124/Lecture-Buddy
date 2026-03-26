import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Seed demo data for development.
 * Call this once after signing in to populate the UI.
 * TODO: remove or gate behind an admin flag before production.
 */
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in to seed");

    // Course
    const courseId = await ctx.db.insert("courses", {
      name: "Introduction to Computer Science",
      code: "CS101",
      instructorName: "Prof. Ada Lovelace",
      ownerId: userId,
      description: "Fundamentals of programming and computational thinking.",
    });

    // Session
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      courseId,
      title: "Lecture 4 – Recursion & Stack Frames",
      startedAt: now - 90 * 60 * 1000,
      endedAt: now - 10 * 60 * 1000,
      durationSeconds: 80 * 60,
      status: "ready",
      processingProgress: 100,
    });

    // Transcript segments
    const transcriptData = [
      { start: 0, end: 12, text: "Alright everyone, today we're going to talk about recursion. It's one of those topics that seems confusing at first but becomes very natural.", speaker: "SPEAKER_00" },
      { start: 12, end: 28, text: "So the key idea is that a function can call itself. Let me draw this on the board.", speaker: "SPEAKER_00" },
      { start: 28, end: 45, text: "Here's a simple example — factorial of n. If n equals zero, we return one. Otherwise we return n times factorial of n minus one.", speaker: "SPEAKER_00" },
      { start: 45, end: 58, text: "Can someone tell me what happens when we call factorial of three?", speaker: "SPEAKER_00" },
      { start: 58, end: 72, text: "Um, it calls factorial of two, which calls factorial of one, which calls factorial of zero?", speaker: "SPEAKER_01", confidence: 0.71 },
      { start: 72, end: 90, text: "Exactly right. And each of those calls gets pushed onto the call stack. Let me show you what that looks like.", speaker: "SPEAKER_00" },
      { start: 90, end: 115, text: "So the stack grows downward here. Each frame holds the local variable n and the return address. When we hit the base case, we start popping frames.", speaker: "SPEAKER_00" },
      { start: 115, end: 130, text: "What happens if we forget the base case? [inaudible]", speaker: "SPEAKER_00", confidence: 0.45 },
      { start: 130, end: 148, text: "Stack overflow! The function keeps calling itself forever until we run out of memory.", speaker: "SPEAKER_01" },
      { start: 148, end: 170, text: "Right, a stack overflow error. Python will actually give you a RecursionError after about a thousand calls by default.", speaker: "SPEAKER_00" },
    ];

    const transcriptIds: Array<import("./_generated/dataModel").Id<"transcriptSegments">> = [];
    for (const t of transcriptData) {
      const id = await ctx.db.insert("transcriptSegments", {
        sessionId,
        startOffsetSeconds: t.start,
        endOffsetSeconds: t.end,
        text: t.text,
        speakerId: t.speaker,
        confidence: t.confidence ?? 0.92,
        language: "en",
      });
      transcriptIds.push(id);
    }

    // Note sections
    await ctx.db.insert("noteSections", {
      sessionId,
      orderIndex: 0,
      heading: "What is Recursion?",
      body: "A **recursive function** is one that calls itself as part of its own definition.\n\n- The function must have a **base case** that stops the recursion\n- Each recursive call should move closer to the base case\n- Without a base case, you get infinite recursion → stack overflow",
      startOffsetSeconds: 0,
      endOffsetSeconds: 90,
      isUserEdited: false,
    });

    await ctx.db.insert("noteSections", {
      sessionId,
      orderIndex: 1,
      heading: "Factorial Example",
      body: "```python\ndef factorial(n):\n    if n == 0:      # base case\n        return 1\n    return n * factorial(n - 1)  # recursive case\n```\n\n**Trace of `factorial(3)`:**\n1. `factorial(3)` → calls `factorial(2)`\n2. `factorial(2)` → calls `factorial(1)`\n3. `factorial(1)` → calls `factorial(0)`\n4. `factorial(0)` → returns `1` (base case)\n5. Unwinds: 1 → 1 → 2 → 6",
      startOffsetSeconds: 28,
      endOffsetSeconds: 90,
      isUserEdited: false,
    });

    await ctx.db.insert("noteSections", {
      sessionId,
      orderIndex: 2,
      heading: "The Call Stack",
      body: "Each function call creates a **stack frame** containing:\n- Local variables (e.g. `n`)\n- Return address\n\nFrames are pushed on call and popped on return. Python's default recursion limit is **~1000 calls**.",
      startOffsetSeconds: 72,
      endOffsetSeconds: 170,
      isUserEdited: false,
    });

    // Uncertainty flags
    await ctx.db.insert("uncertaintyFlags", {
      sessionId,
      offsetSeconds: 115,
      kind: "unclear_audio",
      description: "Audio was inaudible around 1:55 — question from instructor may be missing.",
      severity: "medium",
      relatedTranscriptId: transcriptIds[7],
      isResolved: false,
    });

    await ctx.db.insert("uncertaintyFlags", {
      sessionId,
      offsetSeconds: 58,
      kind: "low_confidence_transcript",
      description: "Student response at 0:58 had low ASR confidence (0.71). May contain errors.",
      severity: "low",
      relatedTranscriptId: transcriptIds[4],
      isResolved: false,
    });

    // Processing jobs (historical)
    await ctx.db.insert("processingJobs", {
      sessionId,
      jobType: "transcription",
      status: "done",
      startedAt: now - 9 * 60 * 1000,
      completedAt: now - 7 * 60 * 1000,
    });

    await ctx.db.insert("processingJobs", {
      sessionId,
      jobType: "note_generation",
      status: "done",
      startedAt: now - 7 * 60 * 1000,
      completedAt: now - 5 * 60 * 1000,
    });

    return { courseId, sessionId };
  },
});
