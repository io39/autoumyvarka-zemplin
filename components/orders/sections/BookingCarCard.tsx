import Link from "next/link";
import type { CarRow } from "@/lib/supabase/types";
import { formatCarLabel, formatCarPrimary } from "@/lib/cars/format";
import { Button } from "@/components/ui/button";

/**
 * Auto block — ŠPZ, brand + model, pricing category (UI-STRUCTURE §7 #5). When
 * `editHref` is set (manager + pending order) a "Zmeniť" button opens the edit
 * wizard at the Auto step so the order can be switched to another of the
 * client's cars.
 */
export function BookingCarCard({ car, editHref }: { car: CarRow; editHref?: string }) {
  return (
    <section className="rounded-lg border p-4 text-sm" data-section="car">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Auto</div>
        {editHref && (
          <Button asChild variant="outline" size="sm" className="-my-1 h-7">
            <Link href={editHref}>Zmeniť</Link>
          </Button>
        )}
      </div>
      <div className="break-words font-medium">{formatCarPrimary(car)}</div>
      <div className="break-words text-muted-foreground">
        {/* ŠPZ already headlines the brand/model when plateless — avoid repeating it. */}
        {(car.spz ? formatCarLabel(car.brand, car.model) : "") || "—"} ({car.pricing_category})
      </div>
    </section>
  );
}
