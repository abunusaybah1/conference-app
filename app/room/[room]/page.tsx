import { Suspense } from "react";
import RoomClient from "./RoomClient";

type Props = {
  params: Promise<{ room: string }>;
  searchParams: Promise<{ hk?: string }>;
};

async function RoomLoader({ params, searchParams }: Props) {
  const { room } = await params;
  const { hk } = await searchParams;

  return <RoomClient room={room} hostKey={hk ?? ""} />;
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
