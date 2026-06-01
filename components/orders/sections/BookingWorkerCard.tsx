"use client";

import { useState } from "react";
import type { OrderDetail } from "@/lib/actions/orders";
import type { WorkerRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WorkerLite = Pick<WorkerRow, "id" | "display_name" | "active">;

/** Assigned workers + add/remove (UI-STRUCTURE §7 #7 — both roles). */
export function BookingWorkerCard({
  workers,
  assignable,
  pending,
  onAdd,
  onRemove,
}: {
  workers: OrderDetail["workers"];
  assignable: WorkerLite[];
  pending: boolean;
  onAdd: (workerId: string) => void;
  onRemove: (workerId: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  return (
    <section data-section="workers" className="space-y-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">Pracovníci</h2>
      <ul className="space-y-1 text-sm">
        {workers.length === 0 && (
          <li className="text-muted-foreground">Nepridelený žiadny pracovník.</li>
        )}
        {workers.map((w) => (
          <li
            key={w.worker_id}
            data-worker-id={w.worker_id}
            className="flex items-center justify-between rounded border p-2"
          >
            <span>{w.worker.display_name}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onRemove(w.worker_id)}
            >
              Odobrať
            </Button>
          </li>
        ))}
      </ul>
      {assignable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label htmlFor="worker-select">Pridať pracovníka</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="worker-select">
                <SelectValue placeholder="Vyberte…" />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!selected || pending}
            onClick={() => {
              if (selected) {
                onAdd(selected);
                setSelected("");
              }
            }}
          >
            Pridať
          </Button>
        </div>
      )}
    </section>
  );
}
