"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Zrušiť objednávku" — manager-only soft-delete (UI-STRUCTURE §7 #3 right);
 * disabled once `zaplatena` (rule #5).
 */
export function DeleteOrderDialog({
  disabled,
  pending,
  onConfirm,
}: {
  disabled: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled}>
          Zrušiť objednávku
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zrušiť objednávku?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Objednávka bude označená ako zrušená a termín sa uvoľní.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Späť</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            Zrušiť objednávku
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
