import crypto from "crypto";

export type RoomMode = "audio" | "video";

export const ROOM_NAME_RE = /^c-[a-f0-9]{10}$/;

export function parseMode(value: unknown): RoomMode {
  return value === "audio" ? "audio" : "video";
}

function secret() {
  const s = process.env.ROOM_KEY_SECRET;
  if (!s) throw new Error("ROOM_KEY_SECRET is not set");
  return s;
}

export function newRoomName() {
  return "c-" + crypto.randomBytes(5).toString("hex");
}

export function signHostKey(room: string, mode: RoomMode) {
  return crypto
    .createHmac("sha256", secret())
    .update(`${room}:${mode}`)
    .digest("hex");
}

export function verifyHostKey(room: string, mode: RoomMode, key: string) {
  const expected = Buffer.from(signHostKey(room, mode));
  const given = Buffer.from(key);
  return (
    expected.length === given.length && crypto.timingSafeEqual(expected, given)
  );
}
