import { NextRequest, NextResponse } from "next/server";
import { RECORDING_BUCKET, supabaseAdmin } from "@/lib/supabase";
import { getRecording, isDownloadable } from "@/lib/recordings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rec = await getRecording(id);
  if (!isDownloadable(rec)) {
    return NextResponse.json(
      { error: "This recording is no longer available" },
      { status: 410 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .storage.from(RECORDING_BUCKET)
    .createSignedUrl(rec.file_path, 60, {
      download: `class-${rec.created_at.slice(0, 10)}.ogg`,
    });

  if (error || !data) {
    console.error("signed url failed", error);
    return NextResponse.json(
      { error: "Could not prepare download" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl, 302);
}
