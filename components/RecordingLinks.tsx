"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  status: "recording" | "ready" | "failed";
  created_at: string;
  duration_seconds: number | null;
  size_bytes: number | null;
  expires_at: string | null;
};

// Shown on the "class ended" screen. The recording file is finished a few
// seconds after the class ends, so this checks again every 3 seconds.
export default function RecordingLinks({
  token,
  isHost,
}: {
  token: string;
  isHost: boolean;
}) {
  const [items, setItems] = useState<Item[] | null>(null); // null = checking
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;

    async function load() {
      try {
        const res = await fetch("/api/recording/latest", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setProblem(data.error ?? `Could not check (${res.status})`);
          setItems([]);
          return;
        }
        setProblem("");
        const list: Item[] = data.recordings ?? [];
        setItems(list);
        if (list.some((r) => r.status === "recording") && ++tries < 40) {
          timer = setTimeout(load, 3000);
        }
      } catch {
        if (!cancelled) {
          setProblem("Network error while checking for the recording");
          setItems([]);
        }
      }
    }

    timer = setTimeout(load, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/recording/${id}`,
      );
      setCopied(id);
      setTimeout(() => setCopied(""), 2500);
    } catch {
      // clipboard blocked: the download button still works
    }
  }

  if (items === null) {
    return (
      <p className="text-sm text-neutral-400">Checking for a recording…</p>
    );
  }

  if (problem) {
    return (
      <p className="max-w-xs text-center text-sm text-red-400">
        {isHost
          ? `Recording problem: ${problem}`
          : "Could not load the recording."}
      </p>
    );
  }

  if (items.length === 0) {
    return isHost ? (
      <p className="max-w-xs text-center text-sm text-neutral-400">
        No recording was found for this class. Press “Record audio” during the
        class; a red “being recorded” bar shows while it is on.
      </p>
    ) : null;
  }

  return (
    <div className="w-full max-w-sm space-y-3">
      {items.map((r) => (
        <div
          key={r.id}
          className="space-y-2 rounded-lg border border-neutral-800 p-3"
        >
          <p className="text-sm font-medium">Class recording (audio)</p>

          {r.status === "recording" && (
            <p className="text-sm text-neutral-400">
              Preparing the recording… this takes a few seconds.
            </p>
          )}

          {r.status === "failed" && (
            <p className="text-sm text-red-400">
              {isHost
                ? "This recording could not be saved. The reason is in the server log."
                : "This recording could not be saved."}
            </p>
          )}

          {r.status === "ready" && (
            <>
              <p className="text-xs text-neutral-400">
                {r.duration_seconds
                  ? `${Math.max(1, Math.round(r.duration_seconds / 60))} min`
                  : ""}
                {r.size_bytes
                  ? ` · ${(r.size_bytes / 1_048_576).toFixed(1)} MB`
                  : ""}
              </p>
              <div className="flex gap-2">
                <a
                  href={`/api/recording/${r.id}/download`}
                  className="flex-1 rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-center text-sm font-medium"
                >
                  Download
                </a>
                {isHost && (
                  <button
                    onClick={() => copy(r.id)}
                    className="flex-1 rounded-md border border-neutral-700 hover:bg-neutral-800 px-3 py-2 text-sm"
                  >
                    {copied === r.id ? "Copied ✓" : "Copy link"}
                  </button>
                )}
              </div>
              {r.expires_at && (
                <p className="text-xs text-neutral-500">
                  Available for 48 hours, then it is deleted.
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
