import { NextRequest, NextResponse } from "next/server";
import { RECORDING_BUCKET, supabaseAdmin } from "@/lib/supabase";
import { sendPending } from "@/lib/mailer";

export const runtime = "nodejs";
export const maxDuration = 60;

// Called by a scheduler. Sends any emails still pending (e.g. when the
// provider's daily limit was hit), then deletes expired recordings.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();

  // 1) Finish sending links for recordings that are still downloadable
  const { data: live } = await db
    .from("recordings")
    .select("id")
    .eq("status", "ready")
    .is("deleted_at", null)
    .gt("expires_at", nowIso);

  for (const r of live ?? []) await sendPending(r.id, 20_000);

  // 2) Delete expired recordings
  const { data: expired } = await db
    .from("recordings")
    .select("id, room_name, file_path")
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
    await db.from("recording_recipients").delete().eq("recording_id", r.id);

    // Forget the attendee emails of this class once nothing is left of it
    const { count } = await db
      .from("recordings")
      .select("id", { count: "exact", head: true })
      .eq("room_name", r.room_name)
      .is("deleted_at", null);
    if (!count)
      await db.from("attendees").delete().eq("room_name", r.room_name);
    deleted++;
  }

  return NextResponse.json({ ok: true, deleted });
}
