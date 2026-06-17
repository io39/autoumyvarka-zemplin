import type { CarRow } from "@/lib/supabase/types";
import { formatCarLabel, formatCarPrimary } from "@/lib/cars/format";

/** Auto block — ŠPZ, brand + model, pricing category (UI-STRUCTURE §7 #5). */
export function BookingCarCard({ car }: { car: CarRow }) {
  return (
    <section className="rounded-lg border p-4 text-sm" data-section="car">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Auto</div>
      <div className="break-words font-medium">{formatCarPrimary(car)}</div>
      <div className="break-words text-muted-foreground">
        {/* ŠPZ already headlines the brand/model when plateless — avoid repeating it. */}
        {(car.spz ? formatCarLabel(car.brand, car.model) : "") || "—"} ({car.pricing_category})
      </div>
    </section>
  );
}
