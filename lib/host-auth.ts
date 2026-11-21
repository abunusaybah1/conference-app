import { NextRequest } from "next/server";
import { TokenVerifier } from "livekit-server-sdk";

// Reads the caller's LiveKit token (Authorization: Bearer ...) and returns the
// room only if that token belongs to the host (roomAdmin). The room always
// comes from the signed token, never from the request body.
export async function getHostRoom(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(
    /^Bearer /,
    "",
  );
  if (!token) return null;

  try {
    const claims = await new TokenVerifier(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    ).verify(token);

    if (!claims.video?.room || !claims.video.roomAdmin) return null;
    return claims.video.room;
  } catch {
    return null;
  }
}
