import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { ROOM_NAME_RE, verifyHostKey } from "@/lib/room-keys";
import { supabaseAdmin } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const room = String(body.room ?? "");
  const name = String(body.name ?? "")
    .trim()
    .slice(0, 60);
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const hostKey = typeof body.hostKey === "string" ? body.hostKey : "";

  if (!ROOM_NAME_RE.test(room)) {
    return NextResponse.json({ error: "Invalid room" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address" },
      { status: 400 },
    );
  }

  const isHost = hostKey !== "" && verifyHostKey(room, hostKey);

  // Remember who joined so they can be emailed the recording link.
  // If this fails the person can still join the class.
  try {
    await supabaseAdmin()
      .from("attendees")
      .upsert(
        { room_name: room, email, name, is_host: isHost },
        { onConflict: "room_name,email" },
      );
  } catch (e) {
    console.error("could not save attendee", e);
  }

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
