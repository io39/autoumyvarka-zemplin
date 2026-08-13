import { z } from "zod";

/**
 * BulkGate delivery confirmations (spec 07 §2.5).
 * https://help.bulkgate.com/docs/en/http-api-bulk-delivery-confirmations-and-incoming-sms.html
 *
 * With "Bulk DLRs" enabled in the BulkGate portal the reports arrive as a POST
 * with an `application/json` array; with it disabled they arrive as a GET with a
 * query string. We use the bulk form — it matches the existing webhook Route
 * Handler shape and batches naturally.
 *
 * Pure module: the Route Handler does the I/O, this does the interpretation, so
 * the mapping is unit-testable without a database or a request.
 */

/** A delivery report we can act on. Fields we don't use (`to`, `price`, `channel`,
 *  `date`) are deliberately dropped — `sms_messages` already has them. */
export interface DeliveryReport {
  status: number;
  smsID: string;
}

/**
 * BulkGate status codes → our `sms_status` enum, or `null` for "no conclusion yet".
 *
 * Only 1 and 3 are terminal. 2 (buffered on the SMSC, recipient unavailable) may
 * still be followed by a 1, so writing `failed` there would be wrong. 10 (incoming
 * SMS) and 13 (Viber "seen") are unrelated to our outbound delivery state.
 */
export function mapDeliveryStatus(code: number): "delivered" | "failed" | null {
  switch (code) {
    case 1:
      return "delivered";
    case 3:
      return "failed";
    default:
      return null;
  }
}

/** `status` arrives as a string in the JSON payload; coerce, but don't invent a
 *  value for a missing one. */
const reportSchema = z.object({
  status: z.coerce.number().int(),
  smsID: z.string().min(1),
});

/**
 * Parse a bulk delivery-report payload.
 *
 * Unusable entries are skipped rather than failing the batch: a single malformed
 * report must not cost us the delivery status of every other message in the same
 * POST, and BulkGate will not resend the ones that were fine. A payload that isn't
 * an array at all throws — that's a genuine integration mismatch worth a 400.
 */
export function parseDeliveryReports(payload: unknown): DeliveryReport[] {
  const rows = z.array(z.unknown()).parse(payload);
  const reports: DeliveryReport[] = [];
  for (const row of rows) {
    const parsed = reportSchema.safeParse(row);
    if (parsed.success) reports.push(parsed.data);
  }
  return reports;
}
