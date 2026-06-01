"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCarToClient, linkExistingCar } from "@/lib/actions/cars";
import type { CarRow, PricingCategory } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORY_LABEL: Record<PricingCategory, string> = {
  os: "Osobné",
  suv: "SUV",
  van: "Van",
  dod: "Dodávka",
  motorka: "Motorka",
  stavba: "Stavebné",
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as PricingCategory[];

/**
 * Step 2 — Auto (UI-STRUCTURE §8). Pick one of the client's cars or add a new
 * one (ŠPZ, model, kategória) via `addCarToClient` (shared-ŠPZ aware). The car's
 * pricing category drives step-3 pricing. In edit mode the car list is locked.
 */
export function Step2Car({
  clientId,
  cars,
  selectedCarId,
  locked,
  onSelect,
  onCarAdded,
}: {
  clientId: string;
  cars: CarRow[];
  selectedCarId: string | null;
  locked?: boolean;
  onSelect: (carId: string) => void;
  onCarAdded: (carId: string) => void;
}) {
  return (
    <section className="space-y-3" data-step="car">
      {cars.length === 0 && (
        <p className="text-sm text-muted-foreground">Klient nemá žiadne auto. Pridajte ho nižšie.</p>
      )}
      <ul className="space-y-1" aria-label="Autá klienta">
        {cars.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              data-car-id={c.id}
              disabled={locked && c.id !== selectedCarId}
              aria-pressed={c.id === selectedCarId}
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition-colors",
                c.id === selectedCarId
                  ? "border-primary bg-accent"
                  : "hover:bg-accent/60 disabled:opacity-50",
              )}
            >
              <span className="font-medium">{c.spz}</span>
              <span className="text-muted-foreground">
                {c.model ? `${c.model} · ` : ""}
                {CATEGORY_LABEL[c.pricing_category]}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!locked && <NewCarDialog clientId={clientId} onAdded={onCarAdded} />}
    </section>
  );
}

function NewCarDialog({
  clientId,
  onAdded,
}: {
  clientId: string;
  onAdded: (carId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [spz, setSpz] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState<PricingCategory>("os");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const r = await addCarToClient({
        clientId,
        spz,
        model: model.trim() || undefined,
        pricingCategory: category,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      if ("needsLinkConfirm" in r) {
        // The ŠPZ already exists under another client — link it (shared ŠPZ).
        const link = await linkExistingCar({ clientId, carId: r.existingCar.id });
        if (!link.ok) {
          toast.error(link.message);
          return;
        }
        toast.success("Auto prepojené.");
        setOpen(false);
        onAdded(r.existingCar.id);
        return;
      }
      toast.success("alreadyLinked" in r ? "Auto je už priradené." : "Auto pridané.");
      setOpen(false);
      onAdded(r.carId);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          + nové auto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nové auto</DialogTitle>
          <DialogDescription>ŠPZ a kategória sú povinné.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-car-spz">ŠPZ</Label>
            <Input id="new-car-spz" value={spz} onChange={(e) => setSpz(e.target.value)} placeholder="BV123AB" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-car-model">Model</Label>
            <Input id="new-car-model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-car-category">Kategória</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as PricingCategory)}>
              <SelectTrigger id="new-car-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending || spz.trim().length < 2}>
            {pending ? "Pridávam…" : "Pridať"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
