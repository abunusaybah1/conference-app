import { createClient, SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

// Server-only client using the service role key. Never import this from a
// "use client" file and never put the key in a NEXT_PUBLIC_ variable.
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
    }
    admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return admin;
}

export const RECORDING_BUCKET = process.env.S3_BUCKET ?? "class-recordings";
