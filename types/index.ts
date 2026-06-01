import type { OrderStatus } from "@/lib/supabase/types";

/**
 * Single home for order-status presentation (UI redesign spec 13, UI-STRUCTURE
 * §15.B). Keyed by the real lowercase `OrderStatus` enum.
 *
 * `STATE_LABEL` is the only client-visible text here (Slovak); identifiers stay
 * English. `STATE_COLOR` carries a four-part Tailwind class set per status with
 * explicit `dark:` variants so blocks stay legible in either theme. Every class
 * is a static string literal (no dynamic concatenation) so Tailwind v4's source
 * scan picks them up.
 *
 * Retires the old `lib/orders/colors.ts` (`STATUS_STYLE`). Palette remap vs. the
 * old set (semantics unchanged): vytvorená amber→red, hotová sky→orange,
 * zaplatená emerald→green, nedostavil sa zinc→gray.
 */
export const STATE_LABEL: Record<OrderStatus, string> = {
  vytvorena: "Vytvorená",
  hotova: "Hotová",
  zaplatena: "Zaplatená",
  nedostavil_sa: "Nedostavil sa",
};

export interface StateColor {
  /** Block / badge fill (tint). */
  bg: string;
  /** Border accent. */
  border: string;
  /** Foreground text. */
  text: string;
  /** Solid dot/badge fill (e.g. a legend swatch). */
  badge: string;
}

export const STATE_COLOR: Record<OrderStatus, StateColor> = {
  vytvorena: {
    bg: "bg-red-100 dark:bg-red-950",
    border: "border-red-500 dark:border-red-700",
    text: "text-red-700 dark:text-red-300",
    badge: "bg-red-500",
  },
  hotova: {
    bg: "bg-orange-100 dark:bg-orange-950",
    border: "border-orange-500 dark:border-orange-700",
    text: "text-orange-700 dark:text-orange-300",
    badge: "bg-orange-500",
  },
  zaplatena: {
    bg: "bg-green-100 dark:bg-green-950",
    border: "border-green-500 dark:border-green-700",
    text: "text-green-700 dark:text-green-300",
    badge: "bg-green-500",
  },
  nedostavil_sa: {
    bg: "bg-gray-100 dark:bg-gray-800",
    border: "border-gray-400 dark:border-gray-600",
    text: "text-gray-600 dark:text-gray-300",
    badge: "bg-gray-400",
  },
};
