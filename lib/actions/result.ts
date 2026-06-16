import { ZodError } from "zod";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import type { OverlapInfo } from "@/lib/orders/overlap";

/**
 * Typed Server Action result. Actions never throw to the client (spec 01 §2.6);
 * they return a discriminated result the UI renders inline.
 *
 * A failure may carry `conflict` (box-overlap detected, migration 0016): the UI
 * shows a confirm dialog and retries the action with `allowOverlap: true`.
 */
export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; message: string; conflict?: OverlapInfo };

/**
 * Map a thrown error to a safe Slovak message. zod → first issue message;
 * auth errors → their (already Slovak) message; anything else → a generic
 * message (no internals leaked).
 */
export function toActionError(error: unknown): { ok: false; message: string } {
  if (error instanceof ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Neplatné údaje." };
  }
  if (isForbiddenError(error) || isUnauthenticatedError(error)) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Operácia zlyhala. Skúste to znova." };
}
