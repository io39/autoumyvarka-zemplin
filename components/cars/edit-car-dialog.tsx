"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateCar, type CarOwner } from "@/lib/actions/cars";
import type { CarRow, PricingCategory } from "@/lib/supabase/types";
import { formatCarPrimary } from "@/lib/cars/format";
import { BrandField } from "@/components/cars/brand-field";
import { CategorySelect } from "@/components/cars/category-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Edit one car's ŠPZ / brand / model / category (manager-only — `updateCar`
 * enforces it). When the entered plate already belongs to another car the action
 * returns `needsMergeConfirm` and this dialog asks to **merge** the two rows
 * (spec 02 §2.6). Shared by the clients detail page and the booking wizard's Auto
 * step. `onSaved` fires on a successful save **or** merge.
 */
export function EditCarDialog({
  car,
  onClose,
  onSaved,
}: {
  car: CarRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  // Set when the entered plate already belongs to another car (spec 02 §2.6):
  // holds the survivor + the edits to replay with confirmMerge.
  type CarEdits = { spz: string; brand?: string; model?: string; pricingCategory: PricingCategory };
  const [merge, setMerge] = useState<{ target: CarRow; owners: CarOwner[]; edits: CarEdits } | null>(
    null,
  );

  function save(edits: CarEdits, confirmMerge: boolean) {
    startTransition(async () => {
      const result = await updateCar({ id: car.id, ...edits, confirmMerge });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if ("needsMergeConfirm" in result) {
        setMerge({ target: result.existingCar, owners: result.existingOwners, edits });
        return;
      }
      if ("mergedInto" in result) {
        toast.success("Autá spojené.");
        onSaved();
        return;
      }
      toast.success("Zmeny uložené.");
      onSaved();
    });
  }

  function onSubmit(formData: FormData) {
    const brand = String(formData.get("brand") ?? "");
    const model = String(formData.get("model") ?? "");
    save(
      {
        spz: String(formData.get("spz") ?? ""),
        brand: brand || undefined,
        model: model || undefined,
        pricingCategory: String(formData.get("pricingCategory") ?? "os") as PricingCategory,
      },
      false,
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          setMerge(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {merge ? (
          <>
            <DialogHeader>
              <DialogTitle>Spojiť autá</DialogTitle>
              <DialogDescription>
                Auto {formatCarPrimary(car)} spojiť s autom {formatCarPrimary(merge.target)}?
                {merge.owners.length > 0 && (
                  <>
                    {" "}
                    Auto {formatCarPrimary(merge.target)} patrí{" "}
                    {merge.owners.length > 1 ? "klientom" : "klientovi"}:{" "}
                    <span className="font-medium">
                      {merge.owners.map((o) => o.name?.trim() || o.phone).join(", ")}
                    </span>
                    .
                  </>
                )}{" "}
                Objednávky a klienti auta {formatCarPrimary(car)} sa presunú na auto{" "}
                {formatCarPrimary(merge.target)}. Pôvodné auto sa odstráni a akcia sa nedá vrátiť.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMerge(null)}>
                Zrušiť
              </Button>
              <Button type="button" disabled={pending} onClick={() => save(merge.edits, true)}>
                {pending ? "Spájam…" : "Spojiť"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Upraviť auto {formatCarPrimary(car)}</DialogTitle>
              <DialogDescription>
                {car.spz
                  ? "Upravte ŠPZ, značku, model a kategóriu."
                  : "Doplňte ŠPZ (ak ju už poznáte), značku, model a kategóriu."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-car-spz">ŠPZ (nepovinné)</Label>
                <Input id="edit-car-spz" name="spz" defaultValue={car.spz ?? ""} placeholder="BV123AB" />
              </div>
              <BrandField id="edit-car-brand" name="brand" initial={car.brand ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" name="model" defaultValue={car.model ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricingCategory">Kategória</Label>
                <CategorySelect defaultValue={car.pricing_category} />
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
        )}
      </DialogContent>
    </Dialog>
  );
}
