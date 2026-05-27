import { describe, expect, it } from "vitest";
import { resolveIdentity } from "@/lib/auth/identity";
import { UnauthenticatedError } from "@/lib/auth/errors";

describe("resolveIdentity — production hard-guard", () => {
  it("ignores DEV_AUTH_EMAIL in production and requires the Cloudflare header", () => {
    // DEV_AUTH_EMAIL is set but no header present → must throw (deny), never fall back.
    expect(() =>
      resolveIdentity({ nodeEnv: "production", headerEmail: null, devEmail: "dev@x.sk" }),
    ).toThrow(UnauthenticatedError);
  });

  it("uses the Cloudflare header in production", () => {
    const id = resolveIdentity({
      nodeEnv: "production",
      headerEmail: "Boss@Example.SK",
      devEmail: "dev@x.sk",
    });
    expect(id).toEqual({ email: "boss@example.sk", source: "header" });
  });
});

describe("resolveIdentity — dev shim", () => {
  it("returns the dev identity when DEV_AUTH_EMAIL is set and no header present", () => {
    const id = resolveIdentity({
      nodeEnv: "development",
      headerEmail: null,
      devEmail: "Dev@Example.SK",
    });
    expect(id).toEqual({ email: "dev@example.sk", source: "dev" });
  });

  it("lets a real header win over the dev shim in development", () => {
    const id = resolveIdentity({
      nodeEnv: "development",
      headerEmail: "worker@x.sk",
      devEmail: "dev@x.sk",
    });
    expect(id).toEqual({ email: "worker@x.sk", source: "header" });
  });

  it("throws when no header and no dev email", () => {
    expect(() =>
      resolveIdentity({ nodeEnv: "development", headerEmail: null, devEmail: undefined }),
    ).toThrow(UnauthenticatedError);
  });
});
