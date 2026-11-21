import { NextRequest, NextResponse } from "next/server";
import { RECORDING_BUCKET, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: rec } = await db
    .from("recordings")
    .select("file_path, status, expires_at, deleted_at, created_at")
    .eq("id", id)
    .maybeSingle();

  if (
    !rec ||
    rec.status !== "ready" ||
    rec.deleted_at ||
    !rec.expires_at ||
    new Date(rec.expires_at) < new Date()
  ) {
    return NextResponse.json(
      { error: "This recording is no longer available" },
      { status: 410 },
    );
  }

  const day = rec.created_at.slice(0, 10);
  const { data, error } = await db.storage
    .from(RECORDING_BUCKET)
    .createSignedUrl(rec.file_path, 60, { download: `class-${day}.ogg` });

  if (error || !data) {
    console.error("signed url failed", error);
    return NextResponse.json(
      { error: "Could not prepare download" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl, 302);
}
