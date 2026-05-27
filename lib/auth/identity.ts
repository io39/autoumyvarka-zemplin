import { headers } from "next/headers";
import { UnauthenticatedError } from "./errors";

/** The Cloudflare Access header carrying the authenticated user's email. */
export const CF_ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";

export interface Identity {
  email: string;
  /** Where the identity came from: the Cloudflare header, or the dev shim. */
  source: "header" | "dev";
}

interface ResolveInput {
  nodeEnv: string | undefined;
  /** Email from the Cloudflare Access header, or null if absent. */
  headerEmail: string | null;
  /** DEV_AUTH_EMAIL — dev-only shim identity. Ignored in production. */
  devEmail: string | undefined;
}

/**
 * Pure identity-resolution logic (unit-tested directly — spec 01 §4.3).
 *
 * Production (`NODE_ENV === 'production'`): the identity comes ONLY from the
 * Cloudflare-signed header. A missing header is an error (deny), never a
 * fallback to a dev identity — the dev shim is hard-guarded off here even if
 * DEV_AUTH_EMAIL leaks into the environment.
 *
 * Dev: a real Cloudflare header still wins (lets e2e simulate either identity);
 * otherwise fall back to DEV_AUTH_EMAIL (architecture §2.2).
 */
export function resolveIdentity({ nodeEnv, headerEmail, devEmail }: ResolveInput): Identity {
  if (nodeEnv === "production") {
    if (!headerEmail) throw new UnauthenticatedError();
    return { email: headerEmail.toLowerCase(), source: "header" };
  }

  if (headerEmail) return { email: headerEmail.toLowerCase(), source: "header" };
  if (devEmail) return { email: devEmail.toLowerCase(), source: "dev" };
  throw new UnauthenticatedError();
}

/**
 * Resolve the edge-authenticated identity for the current request. Use the
 * auth helpers (this + getCurrentStaff); never read the header ad hoc.
 */
export async function getIdentity(): Promise<Identity> {
  const h = await headers();
  return resolveIdentity({
    nodeEnv: process.env.NODE_ENV,
    headerEmail: h.get(CF_ACCESS_EMAIL_HEADER),
    devEmail: process.env.DEV_AUTH_EMAIL,
  });
}
