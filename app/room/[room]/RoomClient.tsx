"use client";

import "@livekit/components-styles";
import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  ControlBar,
  GridLayout,
  ParticipantTile,
  Chat,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useMediaDeviceSelect,
  useRoomContext,
  useIsRecording,
} from "@livekit/components-react";
import {
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type Participant,
  type RoomOptions,
} from "livekit-client";
import RecordButton from "@/components/RecordButton";
import RecordingLinks from "@/components/RecordingLinks";

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

// One setting for everyone: faithful sound (long sounds and recitation are not
// filtered out) at a small, steady 32 kbps. Audio is only sent while a mic is on.
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true, // only download video at the size it is shown
  dynacast: true, // publisher stops sending video nobody is watching
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
  },
  videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
  publishDefaults: {
    dtx: false,
    red: false,
    audioPreset: { maxBitrate: 32_000 },
    simulcast: true,
    videoEncoding: VideoPresets.h360.encoding,
    screenShareEncoding: ScreenSharePresets.h720fps5.encoding,
  },
};

/* ---------------- saved session (survives a page reload) ---------------- */

type Saved = { token: string; name: string; isHost: boolean };
const sessionKey = (room: string) => `lk-session:${room}`;

function tokenStillValid(token: string) {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return (
      typeof payload.exp === "number" &&
      payload.exp * 1000 > Date.now() + 60_000
    );
  } catch {
    return false;
  }
}

// Reads the saved session once, in the browser. This component is never
// rendered on the server (see RoomShell), so reading storage here is safe.
function readSaved(room: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(room));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    if (saved.token && tokenStillValid(saved.token)) return saved;
    sessionStorage.removeItem(sessionKey(room));
  } catch {
    // storage unavailable (private mode): just show the join screen
  }
  return null;
}

function readName(): string {
  try {
    return localStorage.getItem("lk-name") ?? "";
  } catch {
    return "";
  }
}

type Props = { room: string; hostKey: string };

export default function RoomClient({ room, hostKey }: Props) {
  // On load / refresh: reconnect automatically if this tab already joined
  const [saved] = useState(() => readSaved(room));
  const [name, setName] = useState(() => saved?.name ?? readName());
  const [token, setToken] = useState(saved?.token ?? "");
  const [isHost, setIsHost] = useState(saved?.isHost ?? false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(false);

  async function join() {
    setJoining(true);
    setError("");
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, name, hostKey }),
    });
    const data = await res.json().catch(() => ({}));
    setJoining(false);
    if (!res.ok) return setError(data.error ?? "Could not join");

    try {
      const saved: Saved = {
        token: data.token,
        name: name.trim(),
        isHost: data.isHost,
      };
      sessionStorage.setItem(sessionKey(room), JSON.stringify(saved));
      localStorage.setItem("lk-name", name.trim());
    } catch {
      // ignore
    }
    setToken(data.token);
    setIsHost(data.isHost);
  }

  function handleDisconnected() {
    try {
      sessionStorage.removeItem(sessionKey(room));
    } catch {
      // ignore
    }
    setLeft(true);
  }

  // The token is kept in state on purpose: it lets the "class ended" screen
  // ask for this class's recording. It is cleared when joining again.
  function joinAgain() {
    setLeft(false);
    setToken("");
    setIsHost(false);
  }

  if (left) {
    return (
      <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-4 p-4">
        <p>You left the class, or it has ended.</p>
        {token && <RecordingLinks token={token} isHost={isHost} />}
        <button
          onClick={joinAgain}
          className="rounded-md bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium"
        >
          Join again
        </button>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="text-xl font-semibold">
            {hostKey ? "Start class" : "Join class"}
          </h1>
          <p className="text-sm text-neutral-400">
            {hostKey
              ? "Your mic starts on. You can turn your camera on at any time."
              : "You join muted. Tap the mic whenever you want to speak."}
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && !joining) join();
            }}
            placeholder="Your name"
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-3 text-base"
          />
          <button
            onClick={join}
            disabled={!name.trim() || joining}
            className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-3 font-medium"
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
      video={false} // anyone allowed can turn the camera on later
      options={ROOM_OPTIONS}
      onDisconnected={handleDisconnected}
      className="!h-dvh flex flex-col bg-neutral-950"
    >
      <Classroom room={room} token={token} isHost={isHost} />
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
}: {
  room: string;
  token: string;
  isHost: boolean;
}) {
  useRoomRerender();

  const elapsed = useElapsed();
  const { localParticipant } = useLocalParticipant();
  const permissions = useLocalParticipantPermissions();
  const participants = useParticipants();
  const isRecording = useIsRecording();

  // Side panel on desktop; closed by default on phones (it opens as a sheet)
  const [panel, setPanel] = useState<"chat" | "people" | null>(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px)").matches
      ? "chat"
      : null,
  );
  const [notice, setNotice] = useState("");
  const [showSpeaker, setShowSpeaker] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speakerMuted, setSpeakerMuted] = useState(false);
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
    await navigator.clipboard.writeText(
      `${window.location.origin}/room/${room}`,
    );
    flash("Student link copied");
  }

  function endClass() {
    if (window.confirm("End the class for everyone?")) manage("end");
  }

  const btn =
    "shrink-0 rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800";

  return (
    <>
      {/* Plays everyone's audio. Volume 0 = speaker muted for me only. */}
      <RoomAudioRenderer volume={speakerMuted ? 0 : volume} />
      <StartAudio
        label="Tap to enable sound"
        className="mx-3 mt-2 rounded bg-emerald-600 px-3 py-2 text-sm font-medium"
      />

      <header className="px-3 py-2 border-b border-neutral-800 text-sm text-neutral-300 space-y-2 md:space-y-0 md:flex md:items-center md:justify-between md:gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium truncate">
            {isHost
              ? "You are the host"
              : iCanPresent
                ? "You are presenting"
                : "Live class"}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
              videoLive
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {videoLive ? "Video live" : "Audio"}
          </span>
          <span className="shrink-0 font-mono text-neutral-400">{elapsed}</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 md:flex-wrap md:overflow-visible">
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
                Copy link
              </button>
              <RecordButton token={token} notify={flash} />
              <button
                onClick={endClass}
                className="shrink-0 rounded border border-red-800 text-red-300 px-3 py-1.5 text-sm hover:bg-red-950"
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

      {isRecording && (
        <div className="flex items-center gap-2 bg-red-950 px-4 py-1 text-sm text-red-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          This class is being recorded (audio only)
        </div>
      )}

      {(notice || micBlocked) && (
        <div className="bg-emerald-900/40 text-emerald-200 text-sm px-4 py-1">
          {micBlocked ? "The host has turned off your microphone." : notice}
        </div>
      )}

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <div className="flex-1 min-w-0 min-h-0 p-2 flex flex-col">
          <div className="flex-1 min-h-0">
            {presenters.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-400 text-center px-4">
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

        {/* Always mounted so chat history is kept when the panel is closed.
            Bottom sheet on phones, side panel from md up. */}
        <aside
          className={`${
            panel ? "flex" : "hidden"
          } fixed inset-x-0 bottom-0 z-30 h-[70dvh] flex-col rounded-t-2xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:static md:z-auto md:h-auto md:w-80 md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 md:hidden">
            <span className="text-sm font-medium">
              {panel === "people" ? "People" : "Chat"}
            </span>
            <button onClick={() => setPanel(null)} className={btn}>
              Close
            </button>
          </div>

          <div className={panel === "chat" ? "flex-1 min-h-0" : "hidden"}>
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
      </div>

      {showSpeaker && (
        <SpeakerMenu
          volume={volume}
          muted={speakerMuted}
          onVolume={setVolume}
          onMuted={setSpeakerMuted}
          onClose={() => setShowSpeaker(false)}
        />
      )}

      {/* Mic button for everyone who may talk. Camera and screen share only
          for the host and anyone the host has allowed. */}
      <div className="flex items-center justify-center gap-2 px-2 pb-[env(safe-area-inset-bottom)] border-t border-neutral-800">
        <div className="min-w-0 overflow-x-auto">
          <ControlBar
            variation="minimal"
            controls={{ chat: false, settings: false, leave: true }}
            className="!border-0"
          />
        </div>
        <button
          onClick={() => setShowSpeaker((v) => !v)}
          className="shrink-0 rounded-md bg-neutral-800 hover:bg-neutral-700 px-3 py-2 text-sm"
          aria-label="Speaker settings"
        >
          {speakerMuted ? "🔇" : "🔊"} Speaker
        </button>
      </div>
    </>
  );
}

/* ---------------- speaker controls ---------------- */

function SpeakerMenu({
  volume,
  muted,
  onVolume,
  onMuted,
  onClose,
}: {
  volume: number;
  muted: boolean;
  onVolume: (v: number) => void;
  onMuted: (m: boolean) => void;
  onClose: () => void;
}) {
  // requestPermissions: false so listeners are not asked for the microphone
  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({
      kind: "audiooutput",
      requestPermissions: false,
    });
  const [msg, setMsg] = useState("");

  const canPickOutput =
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype;

  async function pick(id: string) {
    try {
      await setActiveMediaDevice(id);
      setMsg("");
    } catch {
      setMsg("Could not switch to that output.");
    }
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-40 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl md:inset-x-auto md:right-4 md:w-80 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Speaker</h3>
        <button
          onClick={onClose}
          className="rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800"
        >
          Close
        </button>
      </div>

      <button
        onClick={() => onMuted(!muted)}
        className={`w-full rounded-md px-3 py-2 font-medium ${
          muted ? "bg-red-900/50 text-red-200" : "bg-neutral-800"
        }`}
      >
        {muted ? "🔇 Speaker muted — tap to unmute" : "🔊 Mute speaker"}
      </button>

      <div>
        <label className="text-neutral-400 text-xs">Volume</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          disabled={muted}
          onChange={(e) => onVolume(Number(e.target.value) / 100)}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <p className="text-neutral-400 text-xs mb-1">Play sound through</p>
        {canPickOutput && devices.length > 0 ? (
          <ul className="space-y-1">
            {devices.map((d, i) => (
              <li key={d.deviceId}>
                <button
                  onClick={() => pick(d.deviceId)}
                  className={`w-full text-left rounded-md border px-3 py-2 ${
                    activeDeviceId === d.deviceId
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-neutral-800 hover:bg-neutral-800"
                  }`}
                >
                  {d.label || `Speaker ${i + 1}`}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-400 text-xs">
            Your browser doesn&apos;t let websites choose the audio output. Use
            your phone&apos;s volume buttons, or connect headphones or Bluetooth
            to change where sound plays.
          </p>
        )}
        {msg && <p className="text-red-400 text-xs mt-1">{msg}</p>}
      </div>
    </div>
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
    <div className="h-full flex flex-col items-center justify-center gap-4 text-neutral-200 px-2 text-center">
      <div className="flex gap-3 flex-wrap justify-center">
        {presenters.map((p) => (
          <div
            key={p.identity}
            className={`rounded-full w-20 h-20 md:w-28 md:h-28 flex items-center justify-center text-center text-xs md:text-sm px-2 border-4 transition bg-neutral-900 ${
              p.isSpeaking ? "border-emerald-500" : "border-neutral-800"
            }`}
          >
            <span className="line-clamp-2">{p.name || "Speaker"}</span>
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
    "rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-40";

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
          className="w-full mb-2 rounded bg-neutral-900 border border-neutral-800 px-2 py-2 text-sm"
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
