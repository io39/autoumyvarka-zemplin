"use client";

import { useEffect, useId, useRef } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  getBrowserRealtimeClient,
  setBrowserRealtimeAuth,
  acquireRealtimeTokenRefresh,
} from "./browser";
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
 * The Supabase client is a SHARED singleton (see ./browser), so channel topics
 * must be globally unique — two consumers (e.g. the unpaid badge in both the
 * mobile header and the desktop sidebar) reusing one name would make the second
 * `client.channel(name)` return the first's already-subscribed channel, and the
 * `.on(...)` call then throws "cannot add postgres_changes callbacks after
 * subscribe()". So the hook hands `subscribe` a unique name per call: unique per
 * component instance (`useId`) AND per re-subscribe (`seq`), the latter because
 * `client.removeChannel` is async — a fresh name avoids colliding with the old
 * channel still tearing down.
 *
 * @param realtimeJwt   the server-minted token (may change identity on re-render)
 * @param subscribe     builds + `.subscribe()`s the channel; MUST name it with
 *                      the provided `channelName` (do not hardcode a topic)
 * @param resubscribeKey deps that should actually rebuild the channel
 */
export function useRealtimeChannel(
  realtimeJwt: string,
  subscribe: (client: SupabaseClient, channelName: string) => RealtimeChannel,
  resubscribeKey: unknown[],
): void {
  const uid = useId().replace(/:/g, ""); // useId() contains ":"; keep the topic clean
  const seqRef = useRef(0);
  const tokenRef = useRef(realtimeJwt);
  const subscribeRef = useRef(subscribe);

  // Always call the latest `subscribe` closure when we (re)subscribe.
  useEffect(() => {
    subscribeRef.current = subscribe;
  });

  // Token changes (incl. the revalidation re-mint) update auth on the shared
  // client in place — no channel teardown, so no missed-echo gap.
  useEffect(() => {
    tokenRef.current = realtimeJwt;
    setBrowserRealtimeAuth(realtimeJwt);
  }, [realtimeJwt]);

  // (Re)subscribe only when the caller's key changes.
  useEffect(() => {
    const client: SupabaseClient = getBrowserRealtimeClient(tokenRef.current);
    const releaseRefresh = acquireRealtimeTokenRefresh(client, mintBrowserRealtimeToken);
    const channelName = `rt-${uid}-${seqRef.current++}`;
    const channel = subscribeRef.current(client, channelName);
    return () => {
      releaseRefresh();
      // Remove ONLY this consumer's channel — the client is shared, so
      // removeAllChannels() would tear down the calendar/badges/lists too.
      client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resubscribeKey);
}
