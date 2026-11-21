import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mb(bytes: number | null) {
  return bytes ? `${(bytes / 1_048_576).toFixed(1)} MB` : "";
}

function minutes(seconds: number | null) {
  return seconds ? `${Math.max(1, Math.round(seconds / 60))} min` : "";
}

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: rec } = UUID.test(id)
    ? await supabaseAdmin()
        .from("recordings")
        .select("status, size_bytes, duration_seconds, expires_at, deleted_at, created_at")
        .eq("id", id)
        .maybeSingle()
    : { data: null };

  const available =
    !!rec &&
    rec.status === "ready" &&
    !rec.deleted_at &&
    !!rec.expires_at &&
    new Date(rec.expires_at) > new Date();

  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        {available && rec ? (
          <>
            <h1 className="text-xl font-semibold">Class recording</h1>
            <p className="text-sm text-neutral-400">
              {new Date(rec.created_at).toDateString()}
              {rec.duration_seconds ? ` · ${minutes(rec.duration_seconds)}` : ""}
              {rec.size_bytes ? ` · ${mb(rec.size_bytes)}` : ""}
            </p>
            <a
              href={`/api/recording/${id}/download`}
              className="block rounded-md bg-emerald-600 hover:bg-emerald-500 px-4 py-3 font-medium"
            >
              Download audio
            </a>
            <p className="text-xs text-neutral-500">
              Available until {new Date(rec.expires_at!).toUTCString()}. After
              that it is deleted.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Recording not available</h1>
            <p className="text-sm text-neutral-400">
              This link has expired or the recording is still being prepared.
            </p>
          </>
        )}
      </div>
    </main>
  );
}