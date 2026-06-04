"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client used ONLY for Realtime subscriptions
 * (data-model §3.1). The session token is the server-minted JWT carrying
 * `role: 'authenticated'`; the anon key by itself reads nothing because of
 * the deny-by-default RLS.
 */
export function createBrowserRealtimeClient(realtimeJwt: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  client.realtime.setAuth(realtimeJwt);
  return client;
}

/**
 * Re-mint interval for the Realtime token. The token's TTL is 1h
 * (REALTIME_TOKEN_TTL_SECONDS); refresh at half that so a tab left open never
 * crosses the expiry, and a single failed tick still has a retry before it does.
 */
export const REALTIME_TOKEN_REFRESH_MS = 30 * 60 * 1000;

/**
 * Keep a long-lived browser subscription authenticated. The token is short-lived
 * (1h) and `autoRefreshToken` is off, so without this a tab left open past the
 * TTL silently stops receiving `postgres_changes` and the calendar/badges go
 * stale (the change still happens server-side; the tab just never hears about
 * it). This periodically re-mints the token via `fetchToken` and pushes it onto
 * the existing connection with `setAuth`, which re-authorizes the live channels
 * in place. Returns a cleanup that stops the loop.
 */
export function startRealtimeTokenRefresh(
  client: SupabaseClient,
  fetchToken: () => Promise<string>,
  intervalMs: number = REALTIME_TOKEN_REFRESH_MS,
): () => void {
  const id = setInterval(async () => {
    try {
      const token = await fetchToken();
      if (token) client.realtime.setAuth(token);
    } catch {
      // Keep the current token; the next tick retries before it expires.
    }
  }, intervalMs);
  return () => clearInterval(id);
}
