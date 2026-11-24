import { NextRequest, NextResponse } from "next/server";
import { RECORDING_BUCKET, supabaseAdmin } from "@/lib/supabase";
import {
  RECORDING_COLUMNS,
  RecordingRow,
  refreshRecording,
} from "@/lib/recordings";

// Called by a scheduler. Settles recordings nobody has opened yet (so their
// 48-hour clock starts), then deletes expired files.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();

  // 1) Recordings still marked "recording": ask LiveKit if they have finished
  const { data: open } = await db
    .from("recordings")
    .select(RECORDING_COLUMNS)
    .eq("status", "recording");
  for (const r of (open ?? []) as RecordingRow[]) {
    await refreshRecording(r).catch((e) => console.error("refresh failed", e));
  }

  // 2) Delete expired recordings
  const nowIso = new Date().toISOString();
  const { data: expired } = await db
    .from("recordings")
    .select("id, file_path")
    .is("deleted_at", null)
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso);

  let deleted = 0;
  for (const r of expired ?? []) {
    const { error } = await db.storage
      .from(RECORDING_BUCKET)
      .remove([r.file_path]);
    if (error) {
      console.error("could not delete file", r.file_path, error);
      continue; // try again on the next run
    }
    await db.from("recordings").update({ deleted_at: nowIso }).eq("id", r.id);
    deleted++;
  }

  return NextResponse.json({ ok: true, deleted });
}
