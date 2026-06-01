import type { CarRow } from "@/lib/supabase/types";

/** Auto block — ŠPZ, model, pricing category (UI-STRUCTURE §7 #5). */
export function BookingCarCard({ car }: { car: CarRow }) {
  return (
    <section className="rounded-lg border p-3 text-sm" data-section="car">
      <div className="text-xs uppercase text-muted-foreground">Auto</div>
      <div className="font-medium">{car.spz}</div>
      <div className="text-muted-foreground">
        {car.model ?? "—"} ({car.pricing_category})
      </div>
    </section>
  );
}
