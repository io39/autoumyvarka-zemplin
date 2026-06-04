"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserRealtimeClient, startRealtimeTokenRefresh } from "./browser";
import { mintBrowserRealtimeToken } from "@/lib/actions/realtime";

/**
 * Subscribe to Supabase Realtime for the lifetime of a component, decoupling the
 * subscription from the token value.
 *
 * Why this matters: the page re-mints `realtimeJwt` on every render, and a
 * Server Action that calls `revalidatePath` (e.g. setStatus) re-renders the
 * route and hands the client a *new* token string. If the token were a
 * subscription dependency, that re-render would tear down and re-create the
 * channel — and the actor's own `postgres_changes` echo, emitted right after
 * the commit, could fall into the unsubscribe→resubscribe gap and be missed
 * (the calendar color then doesn't update for the person who made the change,
 * while other tabs, which never revalidated, get it fine).
 *
 * So: token changes are pushed onto the live connection with `setAuth` (no
 * teardown), and the channel is only re-subscribed when `resubscribeKey`
 * changes (e.g. the calendar's view/date). A periodic re-mint keeps a long-idle
 * tab — one that never navigates or acts — from crossing the 1h token TTL.
 *
 * @param realtimeJwt   the server-minted token (may change identity on re-render)
 * @param subscribe     builds + `.subscribe()`s the channel on a given client
 * @param resubscribeKey deps that should actually rebuild the channel
 */
export function useRealtimeChannel(
  realtimeJwt: string,
  subscribe: (client: SupabaseClient) => RealtimeChannel,
  resubscribeKey: unknown[],
): void {
  const tokenRef = useRef(realtimeJwt);
  const clientRef = useRef<SupabaseClient | null>(null);
  const subscribeRef = useRef(subscribe);

  // Always call the latest `subscribe` closure when we (re)subscribe.
  useEffect(() => {
    subscribeRef.current = subscribe;
  });

  // Token changes (incl. the revalidation re-mint) update auth in place — no
  // channel teardown, so no missed-echo gap.
  useEffect(() => {
    tokenRef.current = realtimeJwt;
    clientRef.current?.realtime.setAuth(realtimeJwt);
  }, [realtimeJwt]);

  // (Re)subscribe only when the caller's key changes.
  useEffect(() => {
    const client = createBrowserRealtimeClient(tokenRef.current);
    clientRef.current = client;
    const stopRefresh = startRealtimeTokenRefresh(client, mintBrowserRealtimeToken);
    const channel = subscribeRef.current(client);
    return () => {
      stopRefresh();
      channel.unsubscribe();
      client.removeAllChannels();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resubscribeKey);
}
