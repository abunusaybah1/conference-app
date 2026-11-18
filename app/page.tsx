"use client";

import { useState } from "react";

export default function Home() {
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<{ host: string; join: string } | null>(
    null,
  );

  async function create() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong");
    setLinks({
      host: window.location.origin + data.hostPath,
      join: window.location.origin + data.joinPath,
    });
  }

  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Start a live class</h1>

        <div className="space-y-2">
          <label className="text-sm text-neutral-400">Teacher passcode</label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-3"
          />
        </div>

        <button
          onClick={create}
          disabled={loading || !passcode}
          className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-3 font-medium"
        >
          {loading ? "Creating…" : "Start class"}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {links && (
          <div className="space-y-4 rounded-md border border-neutral-800 p-4 text-sm">
            <div>
              <p className="text-neutral-400 mb-1">Your link (keep private)</p>
              <a
                href={links.host}
                className="break-all text-emerald-400 underline"
              >
                {links.host}
              </a>
            </div>
            <div>
              <p className="text-neutral-400 mb-1">Student link (share this)</p>
              <p className="break-all select-all">{links.join}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
