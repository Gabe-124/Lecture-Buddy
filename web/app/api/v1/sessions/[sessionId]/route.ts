import { NextResponse } from "next/server";
import { requirePiAuthorization } from "../../_utils";
import { getSessionById } from "../../_store";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    requirePiAuthorization(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized Pi API request." },
      { status: 401 },
    );
  }

  const { sessionId } = await context.params;
  const response = await getSessionById(sessionId);

  if (!response) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json(response);
}
