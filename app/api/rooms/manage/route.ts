import { NextRequest, NextResponse } from "next/server";
import {
  RoomServiceClient,
  TokenVerifier,
  TrackSource,
  TrackType,
} from "livekit-server-sdk";

const BASE = {
  canSubscribe: true,
  canPublishData: true,
  canUpdateMetadata: true,
};

// Everyone: microphone only
const MIC_ONLY = {
  ...BASE,
  canPublish: true,
  canPublishSources: [TrackSource.MICROPHONE],
};

// Allowed to use camera and screen share too
const PRESENTER = {
  ...BASE,
  canPublish: true,
  canPublishSources: [
    TrackSource.CAMERA,
    TrackSource.MICROPHONE,
    TrackSource.SCREEN_SHARE,
    TrackSource.SCREEN_SHARE_AUDIO,
  ],
};

// Mic blocked by the host
const BLOCKED = { ...BASE, canPublish: false, canPublishSources: [] };

export async function POST(request: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;

  // Verify the caller really is the host of this room
  const token = (request.headers.get("authorization") ?? "").replace(
    /^Bearer /,
    "",
  );
  let claims;
  try {
    claims = await new TokenVerifier(apiKey, apiSecret).verify(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const room = claims.video?.room;
  if (!room || !claims.video?.roomAdmin) {
    return NextResponse.json({ error: "Host only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const identity = typeof body.identity === "string" ? body.identity : "";

  const svc = new RoomServiceClient(
    process.env.LIVEKIT_URL!,
    apiKey,
    apiSecret,
  );

  async function muteAudioOf(who: string) {
    const info = await svc.getParticipant(room!, who);
    for (const t of info.tracks) {
      if (t.type === TrackType.AUDIO && !t.muted) {
        await svc.mutePublishedTrack(room!, who, t.sid, true);
      }
    }
  }

  try {
    if (action === "end") {
      await svc.deleteRoom(room);
      return NextResponse.json({ ok: true });
    }

    if (action === "muteAll") {
      const everyone = await svc.listParticipants(room);
      const targets = everyone.filter((p) => p.identity !== claims.sub);
      // small batches so a big class doesn't hammer the API at once
      for (let i = 0; i < targets.length; i += 25) {
        await Promise.all(
          targets
            .slice(i, i + 25)
            .flatMap((p) =>
              p.tracks
                .filter((t) => t.type === TrackType.AUDIO && !t.muted)
                .map((t) =>
                  svc.mutePublishedTrack(room, p.identity, t.sid, true),
                ),
            ),
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (!identity || identity === claims.sub) {
      return NextResponse.json(
        { error: "Invalid participant" },
        { status: 400 },
      );
    }

    switch (action) {
      case "mute":
        await muteAudioOf(identity);
        break;

      case "blockMic":
        // Revoking canPublish also stops anything they are publishing
        await svc.updateParticipant(room, identity, { permission: BLOCKED });
        break;

      case "unblockMic":
        await svc.updateParticipant(room, identity, { permission: MIC_ONLY });
        break;

      case "allowVideo":
        await svc.updateParticipant(room, identity, {
          permission: PRESENTER,
          attributes: { hand: "" },
        });
        break;

      case "removeVideo":
        await svc.updateParticipant(room, identity, { permission: MIC_ONLY });
        break;

      case "lowerHand":
        await svc.updateParticipant(room, identity, {
          attributes: { hand: "" },
        });
        break;

      case "remove":
        await svc.removeParticipant(room, identity);
        break;

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("manage error", e);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
