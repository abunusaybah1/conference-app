"use client";

import { useState } from "react";
import { useIsRecording } from "@livekit/components-react";

export default function RecordButton({
  token,
  notify,
}: {
  token: string;
  notify: (message: string) => void;
}) {
  // True for everyone in the room while LiveKit is recording it, so the
  // button state survives a page reload.
  const recording = useIsRecording();
  const [busy, setBusy] = useState(false);

  async function call(path: string, done: string) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      notify(res.ok ? done : (data.error ?? `Request failed (${res.status})`));
    } catch {
      notify("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (recording) {
    return (
      <button
        onClick={() => call("/api/recording/stop", "Recording stopped")}
        disabled={busy}
        className="shrink-0 rounded border border-red-800 bg-red-950 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900 disabled:opacity-60"
      >
        {busy ? "Stopping…" : "Stop recording"}
      </button>
    );
  }

  return (
    <button
      onClick={() => call("/api/recording/start", "Recording started")}
      disabled={busy}
      className="shrink-0 rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-60"
    >
      {busy ? "Starting…" : "Record audio"}
    </button>
  );
}
