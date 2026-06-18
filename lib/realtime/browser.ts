"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client used ONLY for Realtime subscriptions
 * (data-model §3.1). The session token is the server-minted JWT carrying
 * `role: 'authenticated'`; the anon key by itself reads nothing because of
 * the deny-by-default RLS.
 *
 * SINGLETON per browser context. Every page mounts several Realtime consumers
 * (calendar, unpaid/out-of-hours badges + lists) and the calendar re-subscribes
 * on each view/date change; a fresh `createClient` per consumer/re-subscribe
 * spun up a new `GoTrueClient` each time — all under the same auth storage key,
 * which (a) logs "Multiple GoTrueClient instances detected" and (b) accumulates
 * unbounded over a long-lived shared-tablet session (PRD §3), each holding a
 * separate websocket. One shared client multiplexes every channel over a single
 * connection. Identity is constant for the life of the context (a Cloudflare
 * Access identity change is a full reload, which tears this down), so sharing
 * one token/client never mixes privileges — authorization is per-JWT-claim, not
 * per-instance.
 */
let sharedClient: SupabaseClient | null = null;

function ensureClient(): SupabaseClient {
  if (sharedClient) return sharedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  sharedClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return sharedClient;
}

/** Get the shared Realtime client, applying the latest server-minted token. */
export function getBrowserRealtimeClient(realtimeJwt: string): SupabaseClient {
  const client = ensureClient();
  client.realtime.setAuth(realtimeJwt);
  return client;
}

/** Push a refreshed token onto the shared client in place (no-op before first use). */
export function setBrowserRealtimeAuth(realtimeJwt: string): void {
  sharedClient?.realtime.setAuth(realtimeJwt);
}

/**
 * Re-mint interval for the Realtime token. The token's TTL is 1h
 * (REALTIME_TOKEN_TTL_SECONDS); refresh at half that so a tab left open never
 * crosses the expiry, and a single failed tick still has a retry before it does.
 */
export const REALTIME_TOKEN_REFRESH_MS = 30 * 60 * 1000;

/**
 * Keep the long-lived browser subscription authenticated. The token is
 * short-lived (1h) and `autoRefreshToken` is off, so without this a tab left
 * open past the TTL silently stops receiving `postgres_changes` and the
 * calendar/badges go stale (the change still happens server-side; the tab just
 * never hears about it). This periodically re-mints the token via `fetchToken`
 * and pushes it onto the shared connection with `setAuth`, re-authorizing every
 * live channel in place.
 *
 * REF-COUNTED: the client is shared across all consumers, so exactly ONE refresh
 * loop runs regardless of how many components subscribe. Each consumer acquires
 * a lease; the loop starts on the first and stops only when the last releases.
 * Returns that consumer's release fn.
 */
let refreshLeases = 0;
let stopRefresh: (() => void) | null = null;

export function acquireRealtimeTokenRefresh(
  client: SupabaseClient,
  fetchToken: () => Promise<string>,
  intervalMs: number = REALTIME_TOKEN_REFRESH_MS,
): () => void {
  refreshLeases += 1;
  if (!stopRefresh) {
    const id = setInterval(async () => {
      try {
        const token = await fetchToken();
        if (token) client.realtime.setAuth(token);
      } catch {
        // Keep the current token; the next tick retries before it expires.
      }
    }, intervalMs);
    stopRefresh = () => clearInterval(id);
  }
  return () => {
    refreshLeases -= 1;
    if (refreshLeases <= 0 && stopRefresh) {
      stopRefresh();
      stopRefresh = null;
      refreshLeases = 0;
    }
  };
}
