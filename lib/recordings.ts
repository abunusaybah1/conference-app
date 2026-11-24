import { EgressStatus } from "livekit-server-sdk";
import { getEgressClient } from "@/lib/egress";
import { supabaseAdmin } from "@/lib/supabase";

export const RETENTION_HOURS = 48;

export const RECORDING_COLUMNS =
  "id, room_name, egress_id, file_path, status, size_bytes, duration_seconds, created_at, expires_at, deleted_at";

export type RecordingRow = {
  id: string;
  room_name: string;
  egress_id: string;
  file_path: string;
  status: "recording" | "ready" | "failed";
  size_bytes: number | null;
  duration_seconds: number | null;
  created_at: string;
  expires_at: string | null;
  deleted_at: string | null;
};

export function isDownloadable(r: RecordingRow | null): r is RecordingRow {
  return (
    !!r &&
    r.status === "ready" &&
    !r.deleted_at &&
    !!r.expires_at &&
    new Date(r.expires_at) > new Date()
  );
}

// While a row says "recording", ask LiveKit whether the file is finished.
// When it is, store the size/duration and start the 48-hour clock from the
// moment the recording ended.
export async function refreshRecording(
  row: RecordingRow,
): Promise<RecordingRow> {
  if (row.status !== "recording") return row;

  const db = supabaseAdmin();
  const list = await getEgressClient().listEgress({ egressId: row.egress_id });
  const info = list[0];

  async function settle(patch: Partial<RecordingRow>) {
    const { data } = await db
      .from("recordings")
      .update(patch)
      .eq("id", row.id)
      .eq("status", "recording")
      .select(RECORDING_COLUMNS)
      .maybeSingle();
    if (data) return data as RecordingRow;
    // Someone else settled it first: read the current state
    const { data: current } = await db
      .from("recordings")
      .select(RECORDING_COLUMNS)
      .eq("id", row.id)
      .maybeSingle();
    return (current as RecordingRow | null) ?? row;
  }

  if (!info) {
    // LiveKit no longer knows this recording: give up after an hour
    if (Date.now() - new Date(row.created_at).getTime() > 3600_000) {
      return settle({ status: "failed" });
    }
    return row;
  }

  const file = info.fileResults?.[0];
  const reachedLimit = info.status === EgressStatus.EGRESS_LIMIT_REACHED;

  if (info.status === EgressStatus.EGRESS_COMPLETE || (reachedLimit && file)) {
    const endedMs = Number(info.endedAt) / 1e6; // nanoseconds -> ms
    const ended =
      Number.isFinite(endedMs) && endedMs > 0 ? endedMs : Date.now();
    return settle({
      status: "ready",
      size_bytes: file ? Number(file.size) : null,
      duration_seconds: file ? Math.round(Number(file.duration) / 1e9) : null,
      expires_at: new Date(ended + RETENTION_HOURS * 3600_000).toISOString(),
    });
  }

  if (
    info.status === EgressStatus.EGRESS_FAILED ||
    info.status === EgressStatus.EGRESS_ABORTED ||
    reachedLimit
  ) {
    return settle({ status: "failed" });
  }

  return row; // still starting, active or ending
}

export async function getRecording(id: string): Promise<RecordingRow | null> {
  const { data } = await supabaseAdmin()
    .from("recordings")
    .select(RECORDING_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data ? refreshRecording(data as RecordingRow) : null;
}
