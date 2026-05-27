import { describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { mintRealtimeToken, REALTIME_TOKEN_TTL_SECONDS } from "@/lib/realtime/token";

const SECRET = "test-secret-at-least-32-characters-long-xx";

describe("mintRealtimeToken", () => {
  it("produces a JWT verifiable with the secret, with authenticated role and a short TTL", async () => {
    const token = await mintRealtimeToken({ email: "boss@x.sk", source: "header" }, SECRET);

    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));

    expect(payload.role).toBe("authenticated");
    expect(payload.email).toBe("boss@x.sk");

    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeDefined();
    expect(payload.exp!).toBeGreaterThan(now);
    // TTL is bounded and short (no multi-day tokens).
    expect(payload.exp! - now).toBeLessThanOrEqual(REALTIME_TOKEN_TTL_SECONDS + 1);
  });

  it("rejects verification with a wrong secret", async () => {
    const token = await mintRealtimeToken({ email: "boss@x.sk", source: "header" }, SECRET);
    await expect(
      jwtVerify(token, new TextEncoder().encode("a-different-secret-value-32-characters")),
    ).rejects.toThrow();
  });

  it("throws when no secret is available", async () => {
    await expect(
      mintRealtimeToken({ email: "boss@x.sk", source: "header" }, undefined),
    ).rejects.toThrow();
  });
});
