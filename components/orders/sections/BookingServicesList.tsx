"use client";

import Link from "next/link";
import type { OrderDetail } from "@/lib/actions/orders";
import { formatPriceCents } from "@/lib/services/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Service lines + totals (UI-STRUCTURE §7 #6). Removing a line and toggling its
 * "Zaplatené" stay inline (manager); adding a service routes to the edit wizard
 * (Služby step) via `addHref` — there is no inline add form.
 */
export function BookingServicesList({
  lines,
  canEdit,
  canRemove,
  pending,
  addHref,
  onRemove,
  onPaid,
  totalCents,
  priceOverridden,
}: {
  lines: OrderDetail["services"];
  canEdit: boolean;
  canRemove: boolean;
  pending: boolean;
  /** When set (manager), show the "Pridať služby" button linking to the wizard. */
  addHref?: string;
  onRemove: (id: string) => void;
  onPaid: (id: string, paid: boolean) => void;
  totalCents: number;
  /** True when the total is a manager override (not the summed lines). */
  priceOverridden?: boolean;
}) {
  return (
    <section data-section="services" className="space-y-2 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Služby</h2>
      <ul className="space-y-1 text-sm">
        {lines.length === 0 && <li className="text-muted-foreground">Žiadne služby.</li>}
        {lines.map((l) => (
          <li
            key={l.id}
            data-service-line-id={l.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded border p-2 ${
              l.removed_at ? "line-through opacity-50" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{l.name_snapshot}</div>
              <div className="text-xs text-muted-foreground">
                {l.quantity > 1 ? `${l.quantity}× · ` : ""}
                {l.duration_min_snapshot ?? 0} min · {formatPriceCents(l.price_cents_snapshot)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && !l.removed_at && (
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={l.paid}
                    disabled={pending}
                    onChange={(e) => onPaid(l.id, e.target.checked)}
                  />
                  Zaplatené
                </label>
              )}
              {!canEdit && (
                <Badge variant={l.paid ? "default" : "secondary"}>
                  {l.paid ? "Zaplatené" : "Nezaplatené"}
                </Badge>
              )}
              {canEdit && !l.removed_at && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || !canRemove}
                  onClick={() => onRemove(l.id)}
                  title={canRemove ? "Odstrániť" : "Vykonanú službu nie je možné odstrániť."}
                >
                  Odstrániť
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-end gap-1 text-sm">
        {priceOverridden && <span className="text-xs text-muted-foreground">(upravená cena)</span>}
        Cena spolu: <span className="font-medium">{formatPriceCents(totalCents)}</span>
      </div>

      {addHref && (
        <div className="border-t pt-2">
          <Button asChild size="sm" variant="outline">
            <Link href={addHref}>Pridať služby</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
