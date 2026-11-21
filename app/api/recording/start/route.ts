import { NextRequest, NextResponse } from "next/server";
import { getActiveEgress, getEgressClient, startRecording } from "@/lib/egress";
import { getHostRoom } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const room = await getHostRoom(req);
  if (!room) {
    return NextResponse.json({ error: "Host only" }, { status: 403 });
  }

  try {
    if (await getActiveEgress(room)) {
      return NextResponse.json({ error: "Already recording" }, { status: 409 });
    }

    const { egressId, filepath } = await startRecording(room);

    const { error } = await supabaseAdmin().from("recordings").insert({
      room_name: room,
      egress_id: egressId,
      file_path: filepath,
    });

    if (error) {
      // Don't record something we can't track or email
      console.error("could not save recording row", error);
      await getEgressClient()
        .stopEgress(egressId)
        .catch(() => {});
      return NextResponse.json(
        { error: "Could not start recording" },
        { status: 500 },
      );
    }

    return NextResponse.json({ egressId });
  } catch (err) {
    console.error("start recording failed", err);
    return NextResponse.json(
      { error: "Could not start recording" },
      { status: 500 },
    );
  }
}
