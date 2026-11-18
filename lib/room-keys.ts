import crypto from "crypto";

export const ROOM_NAME_RE = /^c-[a-f0-9]{10}$/;

function secret() {
  const s = process.env.ROOM_KEY_SECRET;
  if (!s) throw new Error("ROOM_KEY_SECRET is not set");
  return s;
}

export function newRoomName() {
  return "c-" + crypto.randomBytes(5).toString("hex");
}

export function signHostKey(room: string) {
  return crypto.createHmac("sha256", secret()).update(room).digest("hex");
}

export function verifyHostKey(room: string, key: string) {
  const expected = Buffer.from(signHostKey(room));
  const given = Buffer.from(key);
  return (
    expected.length === given.length && crypto.timingSafeEqual(expected, given)
  );
}
