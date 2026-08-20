import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
// The *service_role* key, not the anon key — this runs server-side only and
// needs to bypass Row Level Security to manage employee records.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(url && serviceKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;

export const PHOTO_BUCKET = "checkin-photos";
