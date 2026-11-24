import { NextRequest, NextResponse } from "next/server";
import { getMember } from "@/lib/host-auth";
import {
  RECORDING_COLUMNS,
  RecordingRow,
  isDownloadable,
  refreshRecording,
} from "@/lib/recordings";
import { supabaseAdmin } from "@/lib/supabase";

// Recordings of the caller's own class. Used by the "class ended" screen,
// which polls this until the file is ready.
export async function GET(req: NextRequest) {
  const member = await getMember(req);
  if (!member) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  const { data } = await supabaseAdmin()
    .from("recordings")
    .select(RECORDING_COLUMNS)
    .eq("room_name", member.room)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  try {
    const rows = await Promise.all(
      ((data ?? []) as RecordingRow[]).map(refreshRecording),
    );
    return NextResponse.json({
      recordings: rows
        .filter((r) => r.status === "recording" || isDownloadable(r))
        .map((r) => ({
          id: r.id,
          status: r.status,
          created_at: r.created_at,
          duration_seconds: r.duration_seconds,
          size_bytes: r.size_bytes,
          expires_at: r.expires_at,
        })),
    });
  } catch (err) {
    console.error("latest recordings failed", err);
    return NextResponse.json({ error: "Try again" }, { status: 500 });
  }
}
