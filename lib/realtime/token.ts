import "server-only";
import { SignJWT } from "jose";
import type { Identity } from "@/lib/auth/identity";

/** Realtime tokens are short-lived; the browser only holds a live subscription. */
export const REALTIME_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Mint a short-lived Supabase JWT for a browser Realtime subscription
 * (data-model §3.1). Signed with SUPABASE_JWT_SECRET, carrying
 * `role: 'authenticated'` so RLS read policies (added with the live calendar)
 * grant access while the bare anon key grants nothing.
 *
 * The secret is injectable so the helper is unit-testable without env setup.
 */
export async function mintRealtimeToken(
  identity: Identity,
  secret: string | undefined = process.env.SUPABASE_JWT_SECRET,
): Promise<string> {
  if (!secret) throw new Error("SUPABASE_JWT_SECRET is not set.");

  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "authenticated", email: identity.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + REALTIME_TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}
