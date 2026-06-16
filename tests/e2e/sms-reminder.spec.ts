import { test, expect } from "@playwright/test";
import { MANAGER_EMAIL, serviceClient, uniquePhone, uniqueSpz } from "./support";

const SECRET = process.env.REMINDER_TRIGGER_SECRET ?? "dev-reminder-secret";

async function seedReminderOrder(opts: {
  minutesFromNow: number;
  status?: "vytvorena" | "hotova";
  deleted?: boolean;
  remindedAt?: string;
  box?: number;
}): Promise<string> {
  const db = serviceClient();
  const { data: manager } = await db
    .from("staff")
    .select("id")
    .eq("email", MANAGER_EMAIL)
    .single();

  const { data: client } = await db
    .from("clients")
    .insert({ phone: `+421${uniquePhone().slice(1)}`, name: "Reminder klient" })
    .select("id")
    .single();
  const { data: car } = await db
    .from("cars")
    .insert({ spz: uniqueSpz("RM"), pricing_category: "os" })
    .select("id")
    .single();
  await db.from("client_cars").insert({ client_id: client!.id, car_id: car!.id });

  // Add a small random offset (0–60 s) per insert so back-to-back seeds inside
  // the same `now+30min` window don't collide on the box-overlap exclusion
  // constraint across test() runs. The window check (±2 min in the route
  // handler) is wide enough to accept these.
  const jitterMs = Math.floor(Math.random() * 60_000);
  const startsAt = new Date(
    Date.now() + opts.minutesFromNow * 60_000 + jitterMs,
  ).toISOString();
  const { data: order, error } = await db
    .from("orders")
    .insert({
      client_id: client!.id,
      car_id: car!.id,
      box: opts.box ?? 2,
      starts_at: startsAt,
      duration_min: 30,
      ends_at: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
      status: opts.status ?? "vytvorena",
      created_by: manager!.id,
      deleted_at: opts.deleted ? new Date().toISOString() : null,
      reminded_at: opts.remindedAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return order!.id;
}

test.describe("reminder Route Handler (spec 07 §4.5)", () => {
  // Soft-delete any non-deleted orders left over from prior tests/specs so
  // their `vytvorena` rows don't get re-picked by the reminder window. (Box
  // overlaps are allowed since migration 0016, so leftover orders no longer
  // collide with our seed inserts — only the reminder-window re-pick matters.)
  test.beforeEach(async () => {
    const db = serviceClient();
    await db
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .is("deleted_at", null);
  });

  test("missing/bad secret → 401", async ({ request }) => {
    const noHeader = await request.post("/api/reminders");
    expect(noHeader.status()).toBe(401);
    const wrong = await request.post("/api/reminders", {
      headers: { "x-reminder-secret": "nope" },
    });
    expect(wrong.status()).toBe(401);
  });

  test("eligible order is reminded once; second call is a no-op", async ({ request }) => {
    const id = await seedReminderOrder({ minutesFromNow: 30 });

    const first = await request.post("/api/reminders", {
      headers: { "x-reminder-secret": SECRET },
    });
    expect(first.status()).toBe(200);

    const db = serviceClient();
    const { data: smsAfterFirst } = await db
      .from("sms_messages")
      .select("type, status")
      .eq("order_id", id);
    expect(smsAfterFirst).toHaveLength(1);
    expect(smsAfterFirst![0].type).toBe("reminder");

    const { data: orderAfterFirst } = await db
      .from("orders")
      .select("reminded_at")
      .eq("id", id)
      .single();
    expect(orderAfterFirst!.reminded_at).not.toBeNull();

    // Second call: order is already reminded → handler should not insert again.
    const second = await request.post("/api/reminders", {
      headers: { "x-reminder-secret": SECRET },
    });
    expect(second.status()).toBe(200);
    const { data: smsAfterSecond } = await db
      .from("sms_messages")
      .select("id")
      .eq("order_id", id);
    expect(smsAfterSecond).toHaveLength(1);
  });

  test("excludes deleted and non-vytvorena orders", async ({ request }) => {
    const okId = await seedReminderOrder({ minutesFromNow: 30 });
    // deletedId is `deleted_at IS NOT NULL` → excluded from the constraint's
    // partial index, so its box/time don't matter for overlap. Reuse box 2.
    const deletedId = await seedReminderOrder({
      minutesFromNow: 30,
      deleted: true,
      box: 2,
    });
    // wrongStatusId is `hotova` → still in the constraint index. Box 1, far
    // future, so it can't overlap any other test fixture.
    const wrongStatusId = await seedReminderOrder({
      minutesFromNow: 30 * 60, // 30 hours out
      status: "hotova",
      box: 1,
    });
    // 5 min out — outside the reminder window. Push it far in the future
    // (still <window) so its 30-min span doesn't graze other box-1 orders.
    const tooSoonId = await seedReminderOrder({
      minutesFromNow: 5,
      box: 1,
    });

    const res = await request.post("/api/reminders", {
      headers: { "x-reminder-secret": SECRET },
    });
    expect(res.status()).toBe(200);

    const db = serviceClient();
    for (const id of [deletedId, wrongStatusId, tooSoonId]) {
      const { data: sms } = await db
        .from("sms_messages")
        .select("id")
        .eq("order_id", id);
      expect(sms).toHaveLength(0);
    }
    const { data: okSms } = await db
      .from("sms_messages")
      .select("type")
      .eq("order_id", okId);
    expect(okSms).toHaveLength(1);
  });
});
