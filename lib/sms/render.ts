import type { SmsType } from "@/lib/supabase/types";
import { bratislavaHHMM } from "@/lib/settings/availability";

/**
 * Placeholder substitution for SMS templates (spec 07 §2.2). The template
 * body is editable Slovak text with `{cas}` / `{spz}` / `{nazov}` tokens.
 * Unknown tokens are left in place — surfaced in the editor preview rather
 * than silently dropped, so a typo doesn't ship a message with `{cas}` raw.
 *
 * GSM-with-diacritics counts every character as 2 septets, so a single SMS
 * holds 70 characters. We don't truncate; we report the segment count and
 * the editor flags > 1 segment (PRD §8).
 */
export interface OrderRenderContext {
  startsAt: Date;
  spz: string;
  clientName: string | null;
}

const TOKEN_RE = /\{(\w+)\}/g;

export function renderTemplate(body: string, ctx: OrderRenderContext): string {
  const vars: Record<string, string> = {
    cas: bratislavaHHMM(ctx.startsAt),
    spz: ctx.spz,
    nazov: ctx.clientName ?? "",
  };
  return body.replace(TOKEN_RE, (m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m,
  );
}

/**
 * Segments under the conservative diacritics limit (70 chars per segment).
 * PRD §8: the editor warns past 70 — over that, the message is split by the
 * provider into concatenated parts, which we count for the UI counter.
 */
export function smsSegmentCount(body: string): number {
  if (body.length === 0) return 0;
  // First segment fits 70; concatenated parts fit 67 (UDH steals 3).
  if (body.length <= 70) return 1;
  return 1 + Math.ceil((body.length - 70) / 67);
}

export function smsOverLimit(body: string): boolean {
  return smsSegmentCount(body) > 1;
}

export const SMS_TYPE_LABEL: Record<SmsType, string> = {
  reminder: "Pripomienka",
  ready: "Auto je pripravené",
};
