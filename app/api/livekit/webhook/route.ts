import { NextRequest, NextResponse, after } from "next/server";
import { WebhookReceiver, EgressStatus } from "livekit-server-sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { RETENTION_HOURS, sendPending } from "@/lib/mailer";

export const runtime = "nodejs";
export const maxDuration = 60;

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const auth = req.headers.get("authorization") ?? "";

  let event;
  try {
    event = await receiver.receive(body, auth);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.event !== "egress_ended" || !event.egressInfo) {
    return NextResponse.json({ ok: true });
  }

  const info = event.egressInfo;
  const file = info.fileResults?.[0];
  const ok = info.status === EgressStatus.EGRESS_COMPLETE && !!file;
  const db = supabaseAdmin();

  // Only the first delivery for a recording does anything (webhooks can repeat)
  const { data: rec } = await db
    .from("recordings")
    .update({
      status: ok ? "ready" : "failed",
      size_bytes: file ? Number(file.size) : null,
      duration_seconds: file ? Math.round(Number(file.duration) / 1e9) : null,
      expires_at: ok
        ? new Date(Date.now() + RETENTION_HOURS * 3600_000).toISOString()
        : null,
    })
    .eq("egress_id", info.egressId)
    .eq("status", "recording")
    .select("id, room_name")
    .maybeSingle();

  if (!rec || !ok) return NextResponse.json({ ok: true });

  // Everyone who joined this class, plus the admins
  const { data: attendees } = await db
    .from("attendees")
    .select("email, is_host")
    .eq("room_name", rec.room_name);

  const recipients = new Map<string, number>(); // email -> priority (0 = first)
  for (const e of adminEmails()) recipients.set(e, 0);
  for (const a of attendees ?? []) {
    const prev = recipients.get(a.email);
    const priority = a.is_host ? 0 : 1;
    recipients.set(
      a.email,
      prev === undefined ? priority : Math.min(prev, priority),
    );
  }

  if (recipients.size > 0) {
    await db.from("recording_recipients").upsert(
      [...recipients].map(([email, priority]) => ({
        recording_id: rec.id,
        email,
        priority,
      })),
      { onConflict: "recording_id,email", ignoreDuplicates: true },
    );
    // Reply to LiveKit right away; keep sending emails in the background
    after(() => sendPending(rec.id));
  }

  return NextResponse.json({ ok: true });
}
