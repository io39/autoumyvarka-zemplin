import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  startRealtimeTokenRefresh,
  REALTIME_TOKEN_REFRESH_MS,
} from "@/lib/realtime/browser";
import { REALTIME_TOKEN_TTL_SECONDS } from "@/lib/realtime/token";

/**
 * Regression: the browser Realtime client mints a 1h token and sets it once with
 * autoRefreshToken off, so a tab left open past the TTL silently stopped
 * receiving postgres_changes (the calendar grid went stale). The refresh loop
 * re-mints and re-applies the token well before it expires.
 */
function fakeClient() {
  const setAuth = vi.fn();
  return {
    client: { realtime: { setAuth } } as unknown as SupabaseClient,
    setAuth,
  };
}

describe("startRealtimeTokenRefresh", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes well before the 1h token TTL", () => {
    expect(REALTIME_TOKEN_REFRESH_MS).toBeLessThan(REALTIME_TOKEN_TTL_SECONDS * 1000);
  });

  it("re-mints the token and pushes it to the live connection on each tick", async () => {
    const { client, setAuth } = fakeClient();
    const fetchToken = vi.fn().mockResolvedValue("fresh-token");

    const stop = startRealtimeTokenRefresh(client, fetchToken);

    await vi.advanceTimersByTimeAsync(REALTIME_TOKEN_REFRESH_MS);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(setAuth).toHaveBeenCalledWith("fresh-token");

    await vi.advanceTimersByTimeAsync(REALTIME_TOKEN_REFRESH_MS);
    expect(setAuth).toHaveBeenCalledTimes(2);

    stop();
  });

  it("stops refreshing after cleanup", async () => {
    const { client, setAuth } = fakeClient();
    const fetchToken = vi.fn().mockResolvedValue("t");

    const stop = startRealtimeTokenRefresh(client, fetchToken);
    stop();

    await vi.advanceTimersByTimeAsync(REALTIME_TOKEN_REFRESH_MS * 2);
    expect(fetchToken).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
  });

  it("survives a failed refresh and recovers on the next tick", async () => {
    const { client, setAuth } = fakeClient();
    const fetchToken = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("recovered");

    const stop = startRealtimeTokenRefresh(client, fetchToken);

    await vi.advanceTimersByTimeAsync(REALTIME_TOKEN_REFRESH_MS);
    expect(setAuth).not.toHaveBeenCalled(); // first tick failed, no crash

    await vi.advanceTimersByTimeAsync(REALTIME_TOKEN_REFRESH_MS);
    expect(setAuth).toHaveBeenCalledWith("recovered");

    stop();
  });
});
