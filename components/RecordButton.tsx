"use client";

import { useState } from "react";
import { useIsRecording } from "@livekit/components-react";

export default function RecordButton({ token }: { token: string }) {
  // True for everyone in the room while LiveKit is recording it, so the
  // button state survives a page reload.
  const recording = useIsRecording();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(path: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (recording) {
    return (
      <button
        onClick={() => call("/api/recording/stop")}
        disabled={busy}
        className="shrink-0 rounded border border-red-800 bg-red-950 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900 disabled:opacity-60"
      >
        {busy ? "Stopping…" : "Stop recording"}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => call("/api/recording/start")}
        disabled={busy}
        className="shrink-0 rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-60"
      >
        {busy ? "Starting…" : "Record audio"}
      </button>
      {error && (
        <span className="shrink-0 self-center text-xs text-red-400">
          {error}
        </span>
      )}
    </>
  );
}
