"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createStaff, updateStaff, setStaffActive } from "@/lib/actions/staff";
import type { StaffRow, StaffRole } from "@/lib/supabase/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_LABEL: Record<StaffRole, string> = {
  manazer: "Manažér",
  prevadzka: "Prevádzka",
};

type EditTarget = StaffRow | "new" | null;

export function StaffManager({
  initialStaff,
  currentStaffId,
}: {
  initialStaff: StaffRow[];
  currentStaffId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditTarget>(null);
  const [pending, startTransition] = useTransition();

  function toggleActive(row: StaffRow) {
    startTransition(async () => {
      const result = await setStaffActive({ id: row.id, active: !row.active });
      if (result.ok) {
        toast.success(row.active ? "Zamestnanec deaktivovaný." : "Zamestnanec aktivovaný.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Zamestnanci</h1>
        <Button onClick={() => setEditing("new")}>Pridať</Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Meno</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Rola</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead className="text-right">Akcie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialStaff.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Žiadni zamestnanci.
                </TableCell>
              </TableRow>
            )}
            {initialStaff.map((row) => (
              <TableRow key={row.id} className={row.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  {row.display_name}
                  <span className="block text-xs text-muted-foreground sm:hidden">{row.email}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {row.email}
                </TableCell>
                <TableCell>
                  <Badge variant={row.role === "manazer" ? "default" : "secondary"}>
                    {ROLE_LABEL[row.role]}
                  </Badge>
                </TableCell>
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
                      disabled={pending || (row.active && row.id === currentStaffId)}
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

      <StaffDialog
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

function StaffDialog({
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

  // Re-key the form per target so default values reset between opens.
  const formKey = isNew ? "new" : (row?.id ?? "closed");

  function onSubmit(formData: FormData) {
    const display_name = String(formData.get("display_name") ?? "");
    const role = String(formData.get("role") ?? "") as StaffRole;

    startTransition(async () => {
      if (isNew) {
        const email = String(formData.get("email") ?? "");
        const result = await createStaff({ email, display_name, role });
        if (result.ok) {
          toast.success("Zamestnanec pridaný.");
          onSaved();
        } else {
          toast.error(result.message);
        }
      } else if (row) {
        const result = await updateStaff({ id: row.id, display_name, role });
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
              {isNew
                ? "Zadajte email, meno a rolu nového zamestnanca."
                : "Upravte meno a rolu zamestnanca."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isNew && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="off" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="display_name">Meno</Label>
              <Input
                id="display_name"
                name="display_name"
                required
                defaultValue={row?.display_name ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rola</Label>
              <Select name="role" defaultValue={row?.role ?? "prevadzka"}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manazer">Manažér</SelectItem>
                  <SelectItem value="prevadzka">Prevádzka</SelectItem>
                </SelectContent>
              </Select>
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
