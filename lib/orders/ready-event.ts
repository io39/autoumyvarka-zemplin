import "server-only";

/**
 * Internal ORDER_READY signal (spec 06 §2.2 / spec 07 hook surface). Emitted
 * after the `vytvorena → hotova` transition commits. Phase 1 uses a simple
 * in-process emitter; spec 07 subscribes and enqueues the "ready" SMS. Since
 * Next runs each Server Action invocation in the same Node process where the
 * SMS-send job will live, an in-process bus is sufficient for the single-VPS
 * deployment (architecture §1).
 */

export interface OrderReadyEvent {
  orderId: string;
  actorEmail: string;
  emittedAt: Date;
}

export type OrderReadyListener = (event: OrderReadyEvent) => void | Promise<void>;

const listeners = new Set<OrderReadyListener>();

export function onOrderReady(listener: OrderReadyListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function emitOrderReady(event: OrderReadyEvent): Promise<void> {
  // Fire listeners independently; one failing must not block the others or
  // surface to the caller of the action that triggered the transition.
  await Promise.all(
    Array.from(listeners).map(async (l) => {
      try {
        await l(event);
      } catch {
        // Swallow — SMS pipeline (spec 07) will own its own error reporting.
      }
    }),
  );
}

/** Test helper. */
export function _clearOrderReadyListeners(): void {
  listeners.clear();
}
