import type { CarRow } from "@/lib/supabase/types";

/** Auto block — ŠPZ, model, pricing category (UI-STRUCTURE §7 #5). */
export function BookingCarCard({ car }: { car: CarRow }) {
  return (
    <section className="rounded-lg border p-4 text-sm" data-section="car">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Auto</div>
      <div className="break-words font-medium">{car.spz}</div>
      <div className="break-words text-muted-foreground">
        {car.model ?? "—"} ({car.pricing_category})
      </div>
    </section>
  );
}
