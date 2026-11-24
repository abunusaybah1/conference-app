import { Suspense } from "react";
import { getRecording, isDownloadable } from "@/lib/recordings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">{children}</div>
    </main>
  );
}

async function RecordingDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rec = UUID.test(id) ? await getRecording(id) : null;

  if (!isDownloadable(rec)) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Recording not available</h1>
        <p className="text-sm text-neutral-400">
          This link has expired, or the recording is still being prepared. Try
          again in a minute.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Class recording</h1>
      <p className="text-sm text-neutral-400">
        {new Date(rec.created_at).toDateString()}
        {rec.duration_seconds
          ? ` · ${Math.max(1, Math.round(rec.duration_seconds / 60))} min`
          : ""}
        {rec.size_bytes
          ? ` · ${(rec.size_bytes / 1_048_576).toFixed(1)} MB`
          : ""}
      </p>
      <a
        href={`/api/recording/${id}/download`}
        className="block rounded-md bg-emerald-600 hover:bg-emerald-500 px-4 py-3 font-medium"
      >
        Download audio
      </a>
      <p className="text-xs text-neutral-500">
        Available until {new Date(rec.expires_at!).toUTCString()}. After that it
        is deleted.
      </p>
    </Shell>
  );
}

export default function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Shell>
          <p className="text-neutral-400">Loading…</p>
        </Shell>
      }
    >
      <RecordingDetails params={params} />
    </Suspense>
  );
}
