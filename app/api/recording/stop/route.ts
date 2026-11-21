import { NextRequest, NextResponse } from "next/server";
import { getActiveEgress, getEgressClient } from "@/lib/egress";
import { getHostRoom } from "@/lib/host-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const room = await getHostRoom(req);
  if (!room) {
    return NextResponse.json({ error: "Host only" }, { status: 403 });
  }

  try {
    const active = await getActiveEgress(room);
    if (!active) {
      return NextResponse.json({ error: "Not recording" }, { status: 404 });
    }
    await getEgressClient().stopEgress(active.egressId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("stop recording failed", err);
    return NextResponse.json(
      { error: "Could not stop recording" },
      { status: 500 },
    );
  }
}
