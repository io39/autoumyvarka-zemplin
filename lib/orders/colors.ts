import type { OrderStatus } from "@/lib/supabase/types";

/**
 * Four status colors (PRD §5). Tailwind-class triples for background, border,
 * and text so the calendar block stays legible at any zoom.
 */
export const STATUS_STYLE: Record<OrderStatus, { bg: string; text: string; label: string }> = {
  vytvorena: {
    bg: "bg-amber-100 border-amber-300 hover:bg-amber-200",
    text: "text-amber-900",
    label: "Vytvorená",
  },
  hotova: {
    bg: "bg-sky-100 border-sky-300 hover:bg-sky-200",
    text: "text-sky-900",
    label: "Hotová",
  },
  zaplatena: {
    bg: "bg-emerald-100 border-emerald-300 hover:bg-emerald-200",
    text: "text-emerald-900",
    label: "Zaplatená",
  },
  nedostavil_sa: {
    bg: "bg-zinc-200 border-zinc-400 hover:bg-zinc-300 opacity-60 line-through",
    text: "text-zinc-700",
    label: "Nedostavil sa",
  },
};
