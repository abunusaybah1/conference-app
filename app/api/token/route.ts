import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { ROOM_NAME_RE, verifyHostKey } from "@/lib/room-keys";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const room = String(body.room ?? "");
  const name = String(body.name ?? "")
    .trim()
    .slice(0, 60);
  const hostKey = typeof body.hostKey === "string" ? body.hostKey : "";

  if (!ROOM_NAME_RE.test(room)) {
    return NextResponse.json({ error: "Invalid room" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const isHost = hostKey !== "" && verifyHostKey(room, hostKey);

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: crypto.randomUUID(),
      name,
      ttl: "4h",
    },
  );

  token.addGrant({
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    // Students: microphone only. The host can publish everything.
    ...(isHost ? {} : { canPublishSources: [TrackSource.MICROPHONE] }),
    canPublishData: true,
    canUpdateOwnMetadata: true,
    roomAdmin: isHost,
  });

  return NextResponse.json({ token: await token.toJwt(), isHost });
}
