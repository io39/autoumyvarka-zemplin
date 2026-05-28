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

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  const kind = (process.env.SMS_PROVIDER ?? "fake").toLowerCase();
  switch (kind) {
    case "fake":
      cached = new FakeProvider();
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
