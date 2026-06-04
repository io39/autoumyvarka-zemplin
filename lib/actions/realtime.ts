"use server";

import { getIdentity } from "@/lib/auth/identity";
import { getCurrentStaff } from "@/lib/auth/session";
import { mintRealtimeToken } from "@/lib/realtime/token";

/**
 * Mint a fresh short-lived Realtime token for the current staff member. Called
 * from the browser by the token-refresh loop (lib/realtime/browser.ts) so a
 * long-open subscription re-authorizes before the 1h token expires. Authz: only
 * a known, active staff identity (same gate as the pages that mint the initial
 * token); no role check — read-only access is what the token grants.
 */
export async function mintBrowserRealtimeToken(): Promise<string> {
  await getCurrentStaff();
  return mintRealtimeToken(await getIdentity());
}
