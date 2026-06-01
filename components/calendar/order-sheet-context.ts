"use client";

import { createContext, useContext } from "react";

/**
 * Lets a calendar `BookingBlock` (deep in the Day/Week grid) open the order
 * popup Sheet without prop-drilling a handler through every grid layer. The
 * `CalendarView` orchestrator provides the opener and owns the Sheet. When no
 * provider is present (block rendered outside the calendar), the block falls
 * back to a `/orders/[id]` link.
 */
export const OpenOrderSheetContext = createContext<((orderId: string) => void) | null>(null);

export function useOpenOrderSheet() {
  return useContext(OpenOrderSheetContext);
}
