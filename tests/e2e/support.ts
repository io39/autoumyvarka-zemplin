import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

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

/** A unique SK mobile number (national form) — normalizes to +4219……. */
export function uniquePhone(): string {
  const eight = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `09${eight}`; // 10 national digits
}

/** A unique alphanumeric ŠPZ. */
export function uniqueSpz(prefix = "TT"): string {
  return `${prefix}${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 10)}`;
}

/** Create a client through the /clients UI; returns the new client's id (from the URL). */
export async function createClientViaUI(
  page: Page,
  opts: { phone: string; name?: string },
): Promise<string> {
  await page.goto("/clients");
  await page.getByRole("button", { name: "Nový klient" }).click();
  await page.getByLabel("Telefón").fill(opts.phone);
  if (opts.name) await page.getByLabel("Meno").fill(opts.name);
  await page.getByRole("button", { name: "Vytvoriť" }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  const m = page.url().match(/\/clients\/([0-9a-f-]{36})$/);
  expect(m).not.toBeNull();
  return m![1];
}

/** Add a car to the currently-open client detail page via the dialog. */
export async function addCarViaUI(page: Page, spz: string): Promise<void> {
  await page.getByRole("button", { name: "Pridať auto" }).click();
  await page.getByLabel("ŠPZ").fill(spz);
  await page.getByRole("button", { name: "Pridať" }).click();
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
