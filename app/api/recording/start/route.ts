import { NextRequest, NextResponse } from "next/server";
import { getActiveEgress, getEgressClient, startRecording } from "@/lib/egress";
import { getHostRoom } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";

function fail(message: string, status = 500) {
  return NextResponse.json({ error: message.slice(0, 200) }, { status });
}

export async function POST(req: NextRequest) {
  const room = await getHostRoom(req);
  if (!room) return fail("Host only", 403);

  try {
    if (await getActiveEgress(room)) return fail("Already recording", 409);

    const { egressId, filepath } = await startRecording(room);

    const { error } = await supabaseAdmin().from("recordings").insert({
      room_name: room,
      egress_id: egressId,
      file_path: filepath,
    });

    if (error) {
      // Don't record something we can't track
      console.error("could not save recording row", error);
      await getEgressClient()
        .stopEgress(egressId)
        .catch(() => {});
      return fail(`Database: ${error.message}`);
    }

    return NextResponse.json({ egressId });
  } catch (err) {
    console.error("start recording failed", err);
    return fail(
      err instanceof Error ? err.message : "Could not start recording",
    );
  }
}
