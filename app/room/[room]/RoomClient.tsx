"use client";

import "@livekit/components-styles";
import { useEffect, useMemo, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  GridLayout,
  ParticipantTile,
  Chat,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useRoomContext,
} from "@livekit/components-react";
import {
  AudioPresets,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type Participant,
  type RoomOptions,
} from "livekit-client";

type Mode = "audio" | "video";
type Action =
  | "mute"
  | "muteAll"
  | "blockMic"
  | "unblockMic"
  | "allowVideo"
  | "removeVideo"
  | "lowerHand"
  | "remove"
  | "end";

const MAX_PRESENTERS = 10;
const SOURCE_CAMERA = 1; // LiveKit TrackSource.CAMERA

type Props = { room: string; mode: Mode; hostKey: string };

export default function RoomClient({ room, mode, hostKey }: Props) {
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(false);

  const roomOptions = useMemo<RoomOptions>(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
      publishDefaults: {
        dtx: true,
        red: false,
        audioPreset: AudioPresets.speech,
        simulcast: true,
        videoEncoding: VideoPresets.h360.encoding,
        screenShareEncoding: ScreenSharePresets.h720fps5.encoding,
      },
    }),
    [],
  );

  async function join() {
    setJoining(true);
    setError("");
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, name, mode, hostKey }),
    });
    const data = await res.json();
    setJoining(false);
    if (!res.ok) return setError(data.error ?? "Could not join");
    setToken(data.token);
    setIsHost(data.isHost);
  }

  if (left) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <p>The class has ended or you left.</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="text-xl font-semibold">
            {hostKey ? "Start class" : "Join class"}
          </h1>
          <p className="text-sm text-neutral-400">
            {mode === "audio"
              ? "Starts as audio-only — uses very little data."
              : "Starts with video — quality adjusts to your connection."}
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2"
          />
          <button
            onClick={join}
            disabled={!name.trim() || joining}
            className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 font-medium"
          >
            {joining ? "Connecting…" : "Continue"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <LiveKitRoom
      data-lk-theme="default"
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      token={token}
      connect
      audio={isHost} // students join muted and unmute when they want to talk
      video={isHost && mode === "video"}
      options={roomOptions}
      onDisconnected={() => setLeft(true)}
      className="!h-screen flex flex-col bg-neutral-950"
    >
      <Classroom room={room} token={token} isHost={isHost} mode={mode} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

/* ---------------- helpers ---------------- */

// Re-render when people join/leave, change permissions, names or attributes
function useRoomRerender() {
  const room = useRoomContext();
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    room.on(RoomEvent.ParticipantConnected, bump);
    room.on(RoomEvent.ParticipantDisconnected, bump);
    room.on(RoomEvent.ParticipantPermissionsChanged, bump);
    room.on(RoomEvent.ParticipantNameChanged, bump);
    room.on(RoomEvent.ParticipantAttributesChanged, bump);
    room.on(RoomEvent.TrackMuted, bump);
    room.on(RoomEvent.TrackUnmuted, bump);
    return () => {
      room.off(RoomEvent.ParticipantConnected, bump);
      room.off(RoomEvent.ParticipantDisconnected, bump);
      room.off(RoomEvent.ParticipantPermissionsChanged, bump);
      room.off(RoomEvent.ParticipantNameChanged, bump);
      room.off(RoomEvent.ParticipantAttributesChanged, bump);
      room.off(RoomEvent.TrackMuted, bump);
      room.off(RoomEvent.TrackUnmuted, bump);
    };
  }, [room]);
}

function useElapsed() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// May use the microphone
const canTalk = (p: Participant) => Boolean(p.permissions?.canPublish);
// May use camera / screen share (host or "Allow video")
const canPresent = (p: Participant) =>
  Boolean(
    p.permissions?.canPublish &&
    (p.permissions.canPublishSources.length === 0 ||
      p.permissions.canPublishSources.includes(SOURCE_CAMERA)),
  );
const handRaised = (p: Participant) => p.attributes?.hand === "1";

/* ---------------- classroom ---------------- */

function Classroom({
  room,
  token,
  isHost,
  mode,
}: {
  room: string;
  token: string;
  isHost: boolean;
  mode: Mode;
}) {
  useRoomRerender();

  const elapsed = useElapsed();
  const { localParticipant } = useLocalParticipant();
  const permissions = useLocalParticipantPermissions();
  const participants = useParticipants();

  const [panel, setPanel] = useState<"chat" | "people" | null>("chat");
  const [notice, setNotice] = useState("");
  const [dataSaver, setDataSaver] = useState(
    () =>
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true,
  );

  const iCanPresent = canPresent(localParticipant);
  const micBlocked =
    !isHost && permissions !== undefined && !permissions.canPublish;
  const handUp = handRaised(localParticipant);
  const presenters = participants.filter(canPresent);
  const hands = participants.filter((p) => !canPresent(p) && handRaised(p));
  const speakingNow = participants.filter((p) => p.isSpeaking);

  // Tiles only for presenters (camera or placeholder) and screen shares
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const stageTracks = tracks.filter((t) => canPresent(t.participant));
  const videoLive = stageTracks.some(
    (t) => t.publication && !t.publication.isMuted,
  );

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 4000);
  }

  async function manage(action: Action, identity?: string) {
    const res = await fetch("/api/rooms/manage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, identity }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      flash(data.error ?? "That didn't work");
    }
  }

  async function toggleHand() {
    await localParticipant.setAttributes({ hand: handUp ? "" : "1" });
  }

  async function copyStudentLink() {
    const url = `${window.location.origin}/room/${room}?mode=${mode}`;
    await navigator.clipboard.writeText(url);
    flash("Student link copied");
  }

  function endClass() {
    if (window.confirm("End the class for everyone?")) manage("end");
  }

  const btn =
    "rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800";

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-neutral-800 text-sm text-neutral-300">
        <div className="flex items-center gap-3">
          <span className="font-medium">
            {isHost
              ? "You are the host"
              : iCanPresent
                ? "You are presenting"
                : "Live class"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              videoLive
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {videoLive ? "Video live" : "Audio"}
          </span>
          <span className="font-mono text-neutral-400">{elapsed}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isHost && (
            <button onClick={toggleHand} className={btn}>
              {handUp ? "Lower hand ✋" : "Raise hand ✋"}
            </button>
          )}
          {!isHost && !iCanPresent && (
            <button onClick={() => setDataSaver((v) => !v)} className={btn}>
              {dataSaver ? "Show video" : "Audio only (save data)"}
            </button>
          )}
          {isHost && (
            <>
              <button onClick={() => manage("muteAll")} className={btn}>
                Mute all
              </button>
              <button onClick={copyStudentLink} className={btn}>
                Copy student link
              </button>
              <button
                onClick={endClass}
                className="rounded border border-red-800 text-red-300 px-3 py-1 text-sm hover:bg-red-950"
              >
                End class
              </button>
            </>
          )}
          <button
            onClick={() => setPanel(panel === "chat" ? null : "chat")}
            className={btn}
          >
            Chat
          </button>
          <button
            onClick={() => setPanel(panel === "people" ? null : "people")}
            className={btn}
          >
            People ({participants.length})
            {isHost && hands.length > 0 ? ` · ✋${hands.length}` : ""}
          </button>
        </div>
      </header>

      {(notice || micBlocked) && (
        <div className="bg-emerald-900/40 text-emerald-200 text-sm px-4 py-1">
          {micBlocked ? "The host has turned off your microphone." : notice}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 p-2 flex flex-col">
          <div className="flex-1 min-h-0">
            {presenters.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-400">
                Waiting for the teacher to start…
              </div>
            ) : dataSaver && !iCanPresent ? (
              <AudioStage presenters={presenters} total={participants.length} />
            ) : (
              <GridLayout tracks={stageTracks} style={{ height: "100%" }}>
                <ParticipantTile />
              </GridLayout>
            )}
          </div>

          <div className="h-8 flex items-center gap-2 px-2 text-sm text-neutral-400 overflow-hidden">
            {speakingNow.length > 0 ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">
                  Speaking:{" "}
                  {speakingNow
                    .slice(0, 4)
                    .map((p) => p.name || "Someone")
                    .join(", ")}
                  {speakingNow.length > 4 ? ` +${speakingNow.length - 4}` : ""}
                </span>
              </>
            ) : (
              <span>Nobody is speaking</span>
            )}
          </div>
        </div>

        {panel && (
          <aside className="w-80 border-l border-neutral-800 min-h-0 flex flex-col">
            <div
              style={{
                display: panel === "chat" ? "block" : "none",
                height: "100%",
              }}
            >
              <Chat style={{ height: "100%" }} />
            </div>
            {panel === "people" && (
              <PeoplePanel
                isHost={isHost}
                participants={participants}
                onAction={manage}
              />
            )}
          </aside>
        )}
      </div>

      {/* Mic button shows for everyone who may talk. Camera and screen share
          show only for the host and anyone the host has allowed. */}
      <ControlBar
        variation="minimal"
        controls={{ chat: false, settings: false, leave: true }}
      />
    </>
  );
}

/* ---------------- audio-only stage ---------------- */

function AudioStage({
  presenters,
  total,
}: {
  presenters: Participant[];
  total: number;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 text-neutral-200">
      <div className="flex gap-4 flex-wrap justify-center">
        {presenters.map((p) => (
          <div
            key={p.identity}
            className={`rounded-full w-28 h-28 flex items-center justify-center text-center text-sm px-2 border-4 transition bg-neutral-900 ${
              p.isSpeaking ? "border-emerald-500" : "border-neutral-800"
            }`}
          >
            {p.name || "Speaker"}
          </div>
        ))}
      </div>
      <p className="text-sm text-neutral-400">
        {total} {total === 1 ? "person" : "people"} in class · video is off to
        save data
      </p>
    </div>
  );
}

/* ---------------- people panel ---------------- */

function PeoplePanel({
  isHost,
  participants,
  onAction,
}: {
  isHost: boolean;
  participants: Participant[];
  onAction: (action: Action, identity?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);

  const presenters = participants.filter(canPresent);
  const hands = participants.filter((p) => !canPresent(p) && handRaised(p));
  const others = participants
    .filter((p) => !canPresent(p) && !handRaised(p))
    .filter((p) => (p.name || "").toLowerCase().includes(query.toLowerCase()));

  const presentersFull = presenters.length >= MAX_PRESENTERS;
  const small =
    "rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800 disabled:opacity-40";

  function MicIcon({ p }: { p: Participant }) {
    if (!canTalk(p)) return <span title="Mic blocked">🚫</span>;
    return (
      <span
        className={p.isSpeaking ? "text-emerald-400" : "text-neutral-500"}
        title={p.isMicrophoneEnabled ? "Mic on" : "Muted"}
      >
        {p.isMicrophoneEnabled ? "🎤" : "🔇"}
      </span>
    );
  }

  function HostButtons({
    p,
    video,
  }: {
    p: Participant;
    video: "allow" | "remove" | "none";
  }) {
    if (!isHost || p.isLocal) return null;
    return (
      <span className="flex flex-wrap justify-end gap-1 shrink-0">
        <button className={small} onClick={() => onAction("mute", p.identity)}>
          Mute
        </button>
        {canTalk(p) ? (
          <button
            className={small}
            onClick={() => onAction("blockMic", p.identity)}
          >
            Block mic
          </button>
        ) : (
          <button
            className={small}
            onClick={() => onAction("unblockMic", p.identity)}
          >
            Unblock
          </button>
        )}
        {video === "allow" && (
          <button
            className={small}
            disabled={presentersFull}
            title={
              presentersFull
                ? `Limit is ${MAX_PRESENTERS} on camera`
                : undefined
            }
            onClick={() => onAction("allowVideo", p.identity)}
          >
            Allow video
          </button>
        )}
        {video === "remove" && (
          <button
            className={small}
            onClick={() => onAction("removeVideo", p.identity)}
          >
            Remove video
          </button>
        )}
        <button
          className={small}
          onClick={() => onAction("remove", p.identity)}
        >
          Remove
        </button>
      </span>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-5 text-sm">
      <section>
        <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
          Presenters ({presenters.length})
        </h3>
        <ul className="space-y-2">
          {presenters.map((p) => (
            <li
              key={p.identity}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2 min-w-0">
                <MicIcon p={p} />
                <span className="truncate">
                  {p.name || "Speaker"}
                  {p.isLocal ? " (you)" : ""}
                </span>
              </span>
              {/* the host can't be demoted by themselves */}
              <HostButtons p={p} video="remove" />
            </li>
          ))}
        </ul>
      </section>

      {hands.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Hands raised ({hands.length})
          </h3>
          <ul className="space-y-2">
            {hands.map((p) => (
              <li
                key={p.identity}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <MicIcon p={p} />
                  <span className="truncate">✋ {p.name || "Student"}</span>
                </span>
                {isHost && (
                  <span className="flex flex-wrap justify-end gap-1 shrink-0">
                    <button
                      className={small}
                      disabled={presentersFull}
                      onClick={() => onAction("allowVideo", p.identity)}
                    >
                      Allow video
                    </button>
                    <button
                      className={small}
                      onClick={() => onAction("mute", p.identity)}
                    >
                      Mute
                    </button>
                    <button
                      className={small}
                      onClick={() => onAction("lowerHand", p.identity)}
                    >
                      Dismiss
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
          Everyone else ({others.length})
        </h3>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="w-full mb-2 rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm"
        />
        <ul className="space-y-2">
          {others.slice(0, limit).map((p) => (
            <li
              key={p.identity}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2 min-w-0">
                <MicIcon p={p} />
                <span className="truncate">
                  {p.name || "Student"}
                  {p.isLocal ? " (you)" : ""}
                </span>
              </span>
              <HostButtons p={p} video="allow" />
            </li>
          ))}
        </ul>
        {others.length > limit && (
          <button
            className={`${small} mt-2`}
            onClick={() => setLimit((l) => l + 50)}
          >
            Show more ({others.length - limit})
          </button>
        )}
      </section>
    </div>
  );
}
