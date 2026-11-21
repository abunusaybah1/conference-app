import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptions,
  S3Upload,
} from "livekit-server-sdk";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

let client: EgressClient | null = null;

// Created on first use so a missing variable fails with a clear message
// instead of crashing the whole build.
export function getEgressClient(): EgressClient {
  if (!client) {
    client = new EgressClient(
      env("LIVEKIT_URL").replace(/^wss:\/\//, "https://"),
      env("LIVEKIT_API_KEY"),
      env("LIVEKIT_API_SECRET"),
    );
  }
  return client;
}

function storage() {
  return new S3Upload({
    accessKey: env("S3_ACCESS_KEY_ID"),
    secret: env("S3_SECRET_ACCESS_KEY"),
    region: env("S3_REGION"),
    endpoint: env("S3_ENDPOINT"),
    bucket: env("S3_BUCKET"),
    forcePathStyle: true,
  });
}

// The egress currently recording this room, if any.
export async function getActiveEgress(roomName: string) {
  const list = await getEgressClient().listEgress({
    roomName,
    active: true,
  });
  return list[0] ?? null;
}

// Audio only, always. No video is captured, so files stay small
// (about 14 MB per hour at 32 kbps).
export async function startRecording(roomName: string) {
  const filepath = `${roomName}/${Date.now()}.ogg`;

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.OGG,
    filepath,
    output: { case: "s3", value: storage() },
  });

  const info = await getEgressClient().startRoomCompositeEgress(
    roomName,
    output,
    {
      audioOnly: true,
      encodingOptions: new EncodingOptions({ audioBitrate: 32 }),
    },
  );

  return { egressId: info.egressId, filepath };
}
