import { createClient } from "@supabase/supabase-js";

/** Edge identities seeded in supabase/seed.sql. */
export const MANAGER_EMAIL = "filicko203@gmail.com";
export const WORKER_EMAIL = "pracovnik@autoumyvaren.local";

/** Cloudflare Access header the app reads to resolve identity. */
export function accessHeaders(email: string): Record<string, string> {
  return { "Cf-Access-Authenticated-User-Email": email };
}

/** A unique email so create-staff tests never collide across runs. */
export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@test.local`;
}

/**
 * Service-role Supabase client for test-side DB assertions (e.g. reading
 * audit_log). Bypasses RLS by design — same as the app server.
 */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
