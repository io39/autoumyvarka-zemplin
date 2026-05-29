"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorker, updateWorker, setWorkerActive } from "@/lib/actions/workers";
import type { WorkerRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EditTarget = WorkerRow | "new" | null;

export function WorkerManager({ initialWorkers }: { initialWorkers: WorkerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditTarget>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(
    () => (showInactive ? initialWorkers : initialWorkers.filter((w) => w.active)),
    [initialWorkers, showInactive],
  );

  function toggleActive(row: WorkerRow) {
    startTransition(async () => {
      const result = await setWorkerActive({ id: row.id, active: !row.active });
      if (result.ok) {
        toast.success(row.active ? "Zamestnanec deaktivovaný." : "Zamestnanec aktivovaný.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-4" data-section="workers-manager">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Zamestnanci</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Skryť neaktívnych" : "Zobraziť neaktívnych"}
          </Button>
          <Button onClick={() => setEditing("new")}>Pridať</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Mená pracovníkov, ktorých možno priradiť k objednávke. Bez prihlásenia.
      </p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Meno</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead className="text-right">Akcie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Žiadni zamestnanci.
                </TableCell>
              </TableRow>
            )}
            {visible.map((row) => (
              <TableRow
                key={row.id}
                data-worker-id={row.id}
                className={row.active ? "" : "opacity-60"}
              >
                <TableCell className="font-medium">{row.display_name}</TableCell>
                <TableCell>
                  <Badge variant={row.active ? "outline" : "destructive"}>
                    {row.active ? "Aktívny" : "Neaktívny"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                      Upraviť
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => toggleActive(row)}
                    >
                      {row.active ? "Deaktivovať" : "Aktivovať"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <WorkerDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function WorkerDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EditTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = target === "new";
  const row = target && target !== "new" ? target : null;
  const [pending, startTransition] = useTransition();
  const formKey = isNew ? "new" : (row?.id ?? "closed");

  function onSubmit(formData: FormData) {
    const display_name = String(formData.get("display_name") ?? "");
    startTransition(async () => {
      if (isNew) {
        const result = await createWorker({ display_name });
        if (result.ok) {
          toast.success("Zamestnanec pridaný.");
          onSaved();
        } else {
          toast.error(result.message);
        }
      } else if (row) {
        const result = await updateWorker({ id: row.id, display_name });
        if (result.ok) {
          toast.success("Zmeny uložené.");
          onSaved();
        } else {
          toast.error(result.message);
        }
      }
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form key={formKey} action={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isNew ? "Pridať zamestnanca" : "Upraviť zamestnanca"}</DialogTitle>
            <DialogDescription>
              {isNew ? "Zadajte meno nového zamestnanca." : "Upravte meno zamestnanca."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="worker_display_name">Meno</Label>
              <Input
                id="worker_display_name"
                name="display_name"
                required
                defaultValue={row?.display_name ?? ""}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukladám…" : "Uložiť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
