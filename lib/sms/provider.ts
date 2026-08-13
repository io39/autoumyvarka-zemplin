import "server-only";

/**
 * Minimal SMS provider interface (spec 07 §2.1). The real Slovak provider
 * is selected at deploy time via env (`SMS_PROVIDER`, `SMS_PROVIDER_API_KEY`)
 * and pinned to a specific minor when chosen (architecture §1, open per
 * PRD §13#4). Until then, every environment uses the `fake` adapter — no
 * real SMS is ever sent in local/dev/tests.
 */
export interface SendArgs {
  to: string;
  body: string;
}

export interface SendResult {
  providerMessageId: string;
}

export interface SmsProvider {
  send(args: SendArgs): Promise<SendResult>;
}

/**
 * The `fake` adapter (default). Returns a deterministic-looking id.
 *
 * Test-only failure path (spec §4.4): when `SMS_FAKE_ALLOW_FAILURE=1` is set
 * (dev/CI `.env.local` only — never production), a phone ending in
 * `999000000` makes `send` throw. This lets the e2e suite exercise the
 * dispatch failure path without coupling to a real provider. The flag stays
 * unset in production, so even a misconfigured staging env where
 * SMS_PROVIDER=fake leaked through cannot trip the magic-phone trap on a
 * real customer number.
 */
class FakeProvider implements SmsProvider {
  async send({ to }: SendArgs): Promise<SendResult> {
    if (
      process.env.SMS_FAKE_ALLOW_FAILURE === "1" &&
      to.endsWith("999000000")
    ) {
      throw new Error("fake-provider: forced failure");
    }
    return {
      providerMessageId: `fake-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    };
  }
}

/** BulkGate Simple Transactional API (spec 07 §2.1). */
const BULKGATE_ENDPOINT = "https://portal.bulkgate.com/api/1.0/simple/transactional";

interface BulkGateOk {
  data?: { status?: string; sms_id?: string; part_id?: string[]; number?: string };
}
interface BulkGateError {
  type?: string;
  code?: number;
  error?: string;
  detail?: unknown;
}

/**
 * BulkGate adapter — https://help.bulkgate.com/docs/en/http-simple-transactional.html
 *
 * "Simple" rather than "Advanced": the two are identical for a single-recipient
 * send, and Advanced's only additions are server-side `variables` templating —
 * which would duplicate `lib/sms/render.ts` and split template editing across two
 * systems — and `admin`, which we don't use.
 *
 * `unicode: false` is explicit: `renderTemplate` already strips diacritics so the
 * body is GSM-7 (160 chars/segment instead of 70). Relying on their auto-detection
 * would let one stray accented character silently halve our capacity.
 */
class BulkGateProvider implements SmsProvider {
  private readonly applicationId: string;
  private readonly applicationToken: string;
  private readonly senderId: string;
  private readonly senderIdValue: string | undefined;

  constructor() {
    // Fail at construction, not at send time: a missing credential should surface
    // on the first send attempt as a clear config error rather than a provider 400.
    this.applicationId = requireEnv("SMS_PROVIDER_APP_ID");
    this.applicationToken = requireEnv("SMS_PROVIDER_API_KEY");
    // `gSystem` = BulkGate's shared system number (their default). An alphanumeric
    // sender (`gText` + a value) needs registration for SK and cannot receive replies.
    this.senderId = process.env.SMS_SENDER_ID || "gSystem";
    this.senderIdValue = process.env.SMS_SENDER_ID_VALUE || undefined;
  }

  async send({ to, body }: SendArgs): Promise<SendResult> {
    const res = await fetch(BULKGATE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        application_id: this.applicationId,
        application_token: this.applicationToken,
        // Delivery reports report `to` in international format without the "+",
        // so send it the same way and both sides stay comparable.
        number: to.replace(/^\+/, ""),
        text: body,
        unicode: false,
        country: "sk",
        sender_id: this.senderId,
        ...(this.senderIdValue ? { sender_id_value: this.senderIdValue } : {}),
      }),
    });

    const payload: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const err = (payload ?? {}) as BulkGateError;
      throw new Error(
        `BulkGate ${res.status}: ${err.error ?? "unknown error"}${
          err.type ? ` (${err.type})` : ""
        }`,
      );
    }

    const smsId = (payload as BulkGateOk | null)?.data?.sms_id;
    if (!smsId) {
      // A 2xx with no id would otherwise be logged as `sent` with no way to ever
      // match its delivery report.
      throw new Error("BulkGate: response contained no sms_id");
    }
    return { providerMessageId: smsId };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when SMS_PROVIDER=bulkgate.`);
  return value;
}

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  const kind = (process.env.SMS_PROVIDER ?? "fake").toLowerCase();
  switch (kind) {
    case "fake":
      cached = new FakeProvider();
      break;
    case "bulkgate":
      cached = new BulkGateProvider();
      break;
    default:
      // Real provider TBD (PRD §13#4 / architecture §1). Until pinned, refuse
      // to silently fall back — a misconfigured production env should crash
      // visibly rather than send via the fake adapter.
      throw new Error(
        `Unknown SMS_PROVIDER '${kind}'. Set SMS_PROVIDER=fake or wire a real adapter.`,
      );
  }
  return cached;
}

/** Test-only — drop the cached provider so env changes between tests take effect. */
export function _resetSmsProvider(): void {
  cached = null;
}
