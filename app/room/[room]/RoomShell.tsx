"use client";

import dynamic from "next/dynamic";

// Never rendered on the server, so RoomClient can read the saved session
// from the browser straight away, without an effect.
const RoomClient = dynamic(() => import("./RoomClient"), {
  ssr: false,
  loading: () => (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex items-center justify-center">
      <p className="text-neutral-400">Loading…</p>
    </main>
  ),
});

export default function RoomShell(props: { room: string; hostKey: string }) {
  return <RoomClient {...props} />;
}
