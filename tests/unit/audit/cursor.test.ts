import { describe, it, expect } from "vitest";
import { encodeAuditCursor, decodeAuditCursor } from "@/lib/audit/cursor";

describe("audit keyset cursor", () => {
  it("round-trips created_at + id", () => {
    const row = {
      created_at: "2026-05-28T22:33:15.35605+00:00",
      id: "a874f0c8-61d1-4f56-b274-50aaaa17c6dd",
    };
    const decoded = decodeAuditCursor(encodeAuditCursor(row));
    expect(decoded).toEqual({ createdAt: row.created_at, id: row.id });
  });

  it("splits on the LAST separator (uuid id is unambiguous)", () => {
    const decoded = decodeAuditCursor(
      Buffer.from(
        "2026-05-28T22:33:15.35605+00:00|a874f0c8-61d1-4f56-b274-50aaaa17c6dd",
        "utf8",
      ).toString("base64"),
    );
    expect(decoded).toEqual({
      createdAt: "2026-05-28T22:33:15.35605+00:00",
      id: "a874f0c8-61d1-4f56-b274-50aaaa17c6dd",
    });
  });

  it("rejects cursors whose decoded parts aren't a valid ISO timestamp + uuid", () => {
    // The decoded values are interpolated into a PostgREST filter; reject anything
    // that could alter the query (injected commas/parens, non-uuid id, junk ts).
    const enc = (s: string) => Buffer.from(s, "utf8").toString("base64");
    expect(decodeAuditCursor("not base64 with no separator")).toBeNull();
    expect(decodeAuditCursor(enc("nopipe"))).toBeNull();
    expect(decodeAuditCursor(enc("|onlyid"))).toBeNull();
    expect(decodeAuditCursor(enc("onlyts|"))).toBeNull();
    // Structurally fine but id is not a uuid (injection attempt).
    expect(
      decodeAuditCursor(enc("2026-05-28T22:33:15+00:00|x),or(id.gt.0")),
    ).toBeNull();
    // id is a uuid but the timestamp is junk.
    expect(decodeAuditCursor(enc("not-a-ts|a874f0c8-61d1-4f56-b274-50aaaa17c6dd"))).toBeNull();
  });
});
