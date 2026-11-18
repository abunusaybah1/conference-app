import { NextRequest, NextResponse } from "next/server";
import { newRoomName, signHostKey } from "@/lib/room-keys";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (
    !process.env.CREATE_PASSCODE ||
    body.passcode !== process.env.CREATE_PASSCODE
  ) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }

  const room = newRoomName();
  const hostKey = signHostKey(room);

  return NextResponse.json({
    room,
    hostPath: `/room/${room}?hk=${hostKey}`,
    joinPath: `/room/${room}`,
  });
}
