"use client";

import { useState } from "react";
import type { OrderDetail } from "@/lib/actions/orders";
import type { ServiceWithPrices } from "@/lib/actions/services";
import { formatPriceCents } from "@/lib/services/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Service lines + totals + add (manager) (UI-STRUCTURE §7 #6). */
export function BookingServicesList({
  lines,
  canEdit,
  canRemove,
  pending,
  services,
  existingServiceIds,
  onAdd,
  onRemove,
  onPaid,
  totalCents,
}: {
  lines: OrderDetail["services"];
  canEdit: boolean;
  canRemove: boolean;
  pending: boolean;
  services: ServiceWithPrices[];
  existingServiceIds: Set<string>;
  onAdd: (serviceId: string, quantity?: number) => void;
  onRemove: (id: string) => void;
  onPaid: (id: string, paid: boolean) => void;
  totalCents: number;
}) {
  const [selected, setSelected] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  return (
    <section data-section="services" className="space-y-2 rounded-lg border p-3">
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

      <div className="flex justify-end text-sm">
        Cena spolu: <span className="ml-1 font-medium">{formatPriceCents(totalCents)}</span>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label htmlFor="add-service">Pridať službu</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="add-service">
                <SelectValue placeholder="Vyberte…" />
              </SelectTrigger>
              <SelectContent>
                {services
                  .filter((s) => !existingServiceIds.has(s.service.id))
                  .map((s) => (
                    <SelectItem key={s.service.id} value={s.service.id}>
                      {s.service.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-qty">Počet</Label>
            <Input
              id="add-qty"
              inputMode="numeric"
              className="w-20"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={!selected || pending}
            onClick={() => {
              if (!selected) return;
              const q = Math.max(1, Number(quantity) || 1);
              onAdd(selected, q);
              setSelected("");
              setQuantity("1");
            }}
          >
            Pridať službu
          </Button>
        </div>
      )}
    </section>
  );
}
