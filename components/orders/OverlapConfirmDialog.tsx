"use client";

import type { OverlapInfo } from "@/lib/orders/overlap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Warn but allow" overlap confirmation (migration 0016). When a booking action
 * returns a soft `conflict`, the caller shows this dialog naming the clashing
 * reservation(s); confirming retries the action with `allowOverlap: true`.
 */
export function OverlapConfirmDialog({
  conflict,
  pending,
  confirmLabel = "Pokračovať",
  onConfirm,
  onCancel,
}: {
  conflict: OverlapInfo | null;
  pending?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={conflict !== null} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Termín sa prekrýva</DialogTitle>
          <DialogDescription>
            Tento termín sa prekrýva s existujúcou rezerváciou v rovnakom boxe. Chcete
            napriek tomu pokračovať?
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 text-sm" data-overlap-list>
          {conflict?.orders.map((o) => (
            <li key={o.id} className="rounded border bg-muted/40 px-2 py-1.5">
              <span className="font-mono">
                {o.startHHMM}–{o.endHHMM}
              </span>
              {o.carLabel && (
                <>
                  {" · "}
                  <span className="font-medium">{o.carLabel}</span>
                </>
              )}
              {" · "}Box {o.box}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Zrušiť
          </Button>
          <Button data-overlap-confirm onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
