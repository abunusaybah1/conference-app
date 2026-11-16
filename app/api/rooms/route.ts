import { NextRequest, NextResponse } from "next/server";
import { newRoomName, parseMode, signHostKey } from "@/lib/room-keys";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (
    !process.env.CREATE_PASSCODE ||
    body.passcode !== process.env.CREATE_PASSCODE
  ) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }

  const mode = parseMode(body.mode);
  const room = newRoomName();
  const hostKey = signHostKey(room, mode);

  return NextResponse.json({
    room,
    mode,
    hostPath: `/room/${room}?mode=${mode}&hk=${hostKey}`,
    joinPath: `/room/${room}?mode=${mode}`,
  });
}
