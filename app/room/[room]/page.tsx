import { Suspense } from "react";
import RoomShell from "./RoomShell";

type Props = {
  params: Promise<{ room: string }>;
  searchParams: Promise<{ hk?: string }>;
};

async function RoomLoader({ params, searchParams }: Props) {
  const { room } = await params;
  const { hk } = await searchParams;

  return <RoomShell room={room} hostKey={hk ?? ""} />;
}

export default function RoomPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex items-center justify-center">
          <p className="text-neutral-400">Loading class…</p>
        </main>
      }
    >
      <RoomLoader {...props} />
    </Suspense>
  );
}
