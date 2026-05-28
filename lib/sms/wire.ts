import "server-only";

import { onOrderReady, type OrderReadyEvent } from "@/lib/orders/ready-event";
import { dispatchOrderSms } from "./dispatch";

/**
 * Subscribe the "ready" SMS to the ORDER_READY event (spec 06 → spec 07).
 * Module-scoped: importing this file once registers the listener once. The
 * `Set<Listener>` in ready-event.ts already dedupes by reference, but we add
 * an explicit `registered` guard so the invariant survives a future refactor
 * (multi-bundle, route-segment isolation, etc.) without silently double-firing.
 */
const readyListener = async (event: OrderReadyEvent): Promise<void> => {
  await dispatchOrderSms({ orderId: event.orderId, type: "ready" });
};

let registered = false;
if (!registered) {
  onOrderReady(readyListener);
  registered = true;
}
