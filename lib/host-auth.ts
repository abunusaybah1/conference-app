import { NextRequest } from "next/server";
import { TokenVerifier } from "livekit-server-sdk";

async function claimsOf(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(
    /^Bearer /,
    "",
  );
  if (!token) return null;
  try {
    return await new TokenVerifier(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    ).verify(token);
  } catch {
    return null;
  }
}

// Anyone who joined the class (host or student), identified by their signed
// LiveKit token. The room always comes from the token, never from the body.
export async function getMember(
  req: NextRequest,
): Promise<{ room: string; isHost: boolean } | null> {
  const claims = await claimsOf(req);
  const room = claims?.video?.room;
  if (!room) return null;
  return { room, isHost: claims?.video?.roomAdmin === true };
}

// Only the host of the class.
export async function getHostRoom(req: NextRequest): Promise<string | null> {
  const member = await getMember(req);
  return member?.isHost ? member.room : null;
}
