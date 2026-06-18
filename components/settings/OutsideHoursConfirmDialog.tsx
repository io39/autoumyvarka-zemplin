"use client";

import type { OutsideHoursWarning } from "@/lib/actions/result";
import { skPlural } from "@/lib/intl/sk";
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
 * "Warn but allow" confirm shown when a hours change would leave existing
 * upcoming orders outside opening hours. Confirming retries the settings action
 * with `allowOutsideHours: true`.
 */
export function OutsideHoursConfirmDialog({
  warning,
  pending,
  onConfirm,
  onCancel,
}: {
  warning: OutsideHoursWarning | null;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const n = warning?.count ?? 0;
  return (
    <Dialog open={warning !== null} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Objednávky mimo otváracích hodín</DialogTitle>
          <DialogDescription>
            Táto zmena ponechá {n}{" "}
            {skPlural(n, { one: "objednávku", few: "objednávky", many: "objednávok" })}{" "}
            mimo otváracích hodín. Nájdete ich v sekcii &bdquo;Mimo otváracích hodín&ldquo;. Napriek tomu uložiť?
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 text-sm" data-outside-hours-list>
          {warning?.sample.map((s) => (
            <li key={s.id} className="rounded border bg-muted/40 px-2 py-1.5">{s.label}</li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>Zrušiť</Button>
          <Button data-outside-hours-confirm onClick={onConfirm} disabled={pending}>
            Napriek tomu uložiť
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
