import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _clearOrderReadyListeners,
  emitOrderReady,
  onOrderReady,
  type OrderReadyEvent,
} from "@/lib/orders/ready-event";

afterEach(() => _clearOrderReadyListeners());

describe("ORDER_READY emitter", () => {
  it("dispatches to all subscribers once per emit", async () => {
    const a = vi.fn();
    const b = vi.fn();
    onOrderReady(a);
    onOrderReady(b);

    const evt: OrderReadyEvent = {
      orderId: "order-1",
      actorEmail: "x@y.local",
      emittedAt: new Date(),
    };
    await emitOrderReady(evt);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(evt);
  });

  it("one failing listener does not block others", async () => {
    const good = vi.fn();
    onOrderReady(() => {
      throw new Error("boom");
    });
    onOrderReady(good);
    await emitOrderReady({
      orderId: "order-2",
      actorEmail: "x@y.local",
      emittedAt: new Date(),
    });
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe removes the listener", async () => {
    const fn = vi.fn();
    const unsub = onOrderReady(fn);
    unsub();
    await emitOrderReady({
      orderId: "order-3",
      actorEmail: "x@y.local",
      emittedAt: new Date(),
    });
    expect(fn).not.toHaveBeenCalled();
  });
});
