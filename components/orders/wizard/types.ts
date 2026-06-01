import type { Selection } from "@/lib/orders/booking";

export type { Selection };

export type WizardMode = "create" | "edit";

/** A slot chosen in step 4 — box is implicit in the pick. */
export interface PickedSlot {
  dateKey: string; // "YYYY-MM-DD"
  box: 1 | 2;
  localStart: string; // "HH:MM"
}

/** The 4 wizard steps (1-indexed in the UI). */
export const WIZARD_STEPS = ["Klient", "Auto", "Služby", "Termín"] as const;
