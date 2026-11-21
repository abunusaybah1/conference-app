import { supabaseAdmin } from "@/lib/supabase";

export const RETENTION_HOURS = 48;

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function sendOne(email: string, link: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: process.env.MAIL_FROM_NAME ?? "Live Class",
        email: process.env.MAIL_FROM_EMAIL!,
      },
      to: [{ email }],
      subject: "Your class recording is ready (link expires in 48 hours)",
      htmlContent: `
        <p>Assalamu alaikum,</p>
        <p>The audio recording of your class is ready.</p>
        <p><a href="${link}">Download the recording</a></p>
        <p>This link works for ${RETENTION_HOURS} hours. After that the
        recording is deleted, so please download it before then.</p>
      `,
    }),
  });
  return {
    ok: res.ok,
    status: res.status,
    text: res.ok ? "" : await res.text(),
  };
}

// Sends the recording link to everyone not emailed yet: admins and the host
// first, then students. Stops when the time budget runs out or the email
// provider says the daily limit is reached; anything left stays pending and
// is retried by the daily cron.
export async function sendPending(recordingId: string, budgetMs = 45_000) {
  const db = supabaseAdmin();
  const started = Date.now();

  const { data: rec } = await db
    .from("recordings")
    .select("id, status, expires_at, deleted_at")
    .eq("id", recordingId)
    .maybeSingle();

  if (!rec || rec.status !== "ready" || rec.deleted_at) return;
  if (rec.expires_at && new Date(rec.expires_at) < new Date()) return;

  const link = `${appUrl()}/recording/${rec.id}`;

  while (Date.now() - started < budgetMs) {
    const { data: batch } = await db
      .from("recording_recipients")
      .select("email")
      .eq("recording_id", recordingId)
      .is("sent_at", null)
      .order("priority")
      .order("email")
      .limit(10);

    if (!batch || batch.length === 0) return;

    const results = await Promise.all(
      batch.map(async (r) => ({
        email: r.email,
        ...(await sendOne(r.email, link)),
      })),
    );

    let stop = false;
    for (const r of results) {
      // Limit reached or bad credentials: keep the rest pending for later
      if (!r.ok && [401, 402, 403, 429].includes(r.status)) {
        stop = true;
        console.error("email provider refused:", r.status, r.text);
        continue;
      }
      await db
        .from("recording_recipients")
        .update({
          sent_at: new Date().toISOString(),
          error: r.ok ? null : `${r.status} ${r.text}`.slice(0, 300),
        })
        .eq("recording_id", recordingId)
        .eq("email", r.email);
    }
    if (stop) return;
  }
}
