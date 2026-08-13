import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSmsProvider, getSmsProvider } from "@/lib/sms/provider";

/**
 * BulkGate Simple Transactional API adapter (spec 07 §2.1).
 * https://help.bulkgate.com/docs/en/http-simple-transactional.html
 *
 * The provider is exercised through the public `getSmsProvider()` factory with a
 * stubbed global `fetch` — no network, no test-only constructor parameters on the
 * production class.
 */
const ENDPOINT = "https://portal.bulkgate.com/api/1.0/simple/transactional";

function okResponse(smsId = "tmpde1bcd4b1d1"): Response {
  return new Response(
    JSON.stringify({
      data: { status: "accepted", sms_id: smsId, part_id: [smsId], number: "421905123456" },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function errorResponse(): Response {
  return new Response(
    JSON.stringify({
      type: "invalid_phone_number",
      code: 400,
      error: "Invalid phone number",
      detail: null,
    }),
    { status: 400, headers: { "content-type": "application/json" } },
  );
}

/** The JSON body of the single fetch call the adapter made. */
function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  _resetSmsProvider();
  vi.stubEnv("SMS_PROVIDER", "bulkgate");
  vi.stubEnv("SMS_PROVIDER_APP_ID", "app-id-123");
  vi.stubEnv("SMS_PROVIDER_API_KEY", "token-abc");
  vi.stubEnv("SMS_SENDER_ID", "gText");
  vi.stubEnv("SMS_SENDER_ID_VALUE", "Zemplin");
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  _resetSmsProvider();
});

describe("getSmsProvider (bulkgate)", () => {
  it("selects the BulkGate adapter when SMS_PROVIDER=bulkgate", async () => {
    await getSmsProvider().send({ to: "+421905123456", body: "Ahoj" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(ENDPOINT);
  });

  it("refuses to construct without credentials rather than failing at send time", () => {
    _resetSmsProvider();
    vi.stubEnv("SMS_PROVIDER_API_KEY", "");
    expect(() => getSmsProvider()).toThrow(/SMS_PROVIDER_API_KEY/);
  });
});

describe("BulkGate send", () => {
  it("POSTs JSON with the application credentials", async () => {
    await getSmsProvider().send({ to: "+421905123456", body: "Ahoj" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(sentBody(fetchMock)).toMatchObject({
      application_id: "app-id-123",
      application_token: "token-abc",
      text: "Ahoj",
    });
  });

  it("strips the leading + so the number matches the format used in delivery reports", async () => {
    await getSmsProvider().send({ to: "+421905123456", body: "Ahoj" });
    expect(sentBody(fetchMock).number).toBe("421905123456");
  });

  it("forces 7-bit encoding — the body is already stripped of diacritics", async () => {
    await getSmsProvider().send({ to: "+421905123456", body: "Ahoj" });
    expect(sentBody(fetchMock).unicode).toBe(false);
  });

  it("sends the configured sender id", async () => {
    await getSmsProvider().send({ to: "+421905123456", body: "Ahoj" });
    expect(sentBody(fetchMock)).toMatchObject({
      sender_id: "gText",
      sender_id_value: "Zemplin",
    });
  });

  it("defaults to the system sender when none is configured", async () => {
    _resetSmsProvider();
    vi.stubEnv("SMS_SENDER_ID", "");
    vi.stubEnv("SMS_SENDER_ID_VALUE", "");
    await getSmsProvider().send({ to: "+421905123456", body: "Ahoj" });
    const body = sentBody(fetchMock);
    expect(body.sender_id).toBe("gSystem");
    expect(body.sender_id_value).toBeUndefined();
  });

  it("returns the provider message id used to match delivery reports", async () => {
    const result = await getSmsProvider().send({ to: "+421905123456", body: "Ahoj" });
    expect(result.providerMessageId).toBe("tmpde1bcd4b1d1");
  });

  it("throws with the provider's message when the API rejects the send", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse());
    await expect(
      getSmsProvider().send({ to: "abc", body: "Ahoj" }),
    ).rejects.toThrow(/Invalid phone number/);
  });

  it("throws when a 200 response carries no sms_id", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { status: "accepted" } }), { status: 200 }),
    );
    await expect(
      getSmsProvider().send({ to: "+421905123456", body: "Ahoj" }),
    ).rejects.toThrow(/sms_id/);
  });
});
