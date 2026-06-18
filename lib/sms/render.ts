import type { SmsType } from "@/lib/supabase/types";
import { bratislavaHHMM } from "@/lib/settings/availability";

/** Single GSM-7 SMS segment length (chars). */
export const SMS_SINGLE_SEGMENT = 160;
/** Concatenated GSM-7 part length — 7 of the 160 septets go to the UDH join header. */
const SMS_CONCAT_SEGMENT = 153;

/**
 * Strip diacritics so the message is plain GSM-7 ("bez diakritiky"). Slovak with
 * diacritics (č š ž ť ň ô ľ á í …) is UCS-2 — only 70 chars per SMS — and a single
 * accented character forces the WHOLE message into UCS-2. Stripped, the message is
 * GSM-7: 160 chars per segment, cheaper, and rendered reliably on every handset.
 * NFD decomposition handles every Slovak accent; the explicit map covers the few
 * letters NFD doesn't decompose to ASCII.
 */
export function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining marks: á→a, č→c, ô→o, ž→z, …
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Placeholder substitution for SMS templates (spec 07 §2.2). The template body is
 * editable Slovak text with `{cas}` / `{spz}` / `{nazov}` tokens. Unknown tokens
 * are left in place — surfaced in the editor preview rather than silently dropped,
 * so a typo doesn't ship a message with `{cas}` raw.
 *
 * The rendered message is **always stripped of diacritics** — and after token
 * substitution, so an accented client name / ŠPZ is caught too — making it GSM-7
 * (160 chars/segment). We don't truncate; we report the segment count and the
 * editor warns past one segment (spec 07 §2.2/§4.4).
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
  const substituted = body.replace(TOKEN_RE, (m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m,
  );
  return stripDiacritics(substituted);
}

/** GSM-7 extension chars occupy two septets each. */
const GSM7_EXTENDED = new Set([..."€{}[]~^\\|"]);

/** Length of the GSM-7 (diacritic-free) message, counting extension chars as 2. */
export function smsCharCount(body: string): number {
  const text = stripDiacritics(body);
  let n = 0;
  for (const ch of text) n += GSM7_EXTENDED.has(ch) ? 2 : 1;
  return n;
}

/**
 * Segments for the diacritic-free GSM-7 message: 160 chars in a single segment,
 * 153 per part once concatenated. The editor counts the stripped body and warns
 * past one segment (spec 07 §2.2). We never truncate.
 */
export function smsSegmentCount(body: string): number {
  const len = smsCharCount(body);
  if (len === 0) return 0;
  if (len <= SMS_SINGLE_SEGMENT) return 1;
  return Math.ceil(len / SMS_CONCAT_SEGMENT);
}

export function smsOverLimit(body: string): boolean {
  return smsSegmentCount(body) > 1;
}

export const SMS_TYPE_LABEL: Record<SmsType, string> = {
  reminder: "Pripomienka",
  ready: "Auto je pripravené",
};
