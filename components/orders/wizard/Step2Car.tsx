"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { addCarToClient, linkExistingCar } from "@/lib/actions/cars";
import { searchClients } from "@/lib/actions/clients";
import { normalizeSpz } from "@/lib/cars/spz";
import { formatCarLabel, formatCarPrimary } from "@/lib/cars/format";
import type { CarRow, PricingCategory } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { BrandField } from "@/components/cars/brand-field";
import { Badge } from "@/components/ui/badge";
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
  sharedCarIds,
  selectedCarId,
  locked,
  onSelect,
  onCarAdded,
}: {
  clientId: string;
  cars: CarRow[];
  sharedCarIds: string[];
  selectedCarId: string | null;
  locked?: boolean;
  onSelect: (carId: string) => void;
  onCarAdded: (carId: string) => void;
}) {
  const shared = new Set(sharedCarIds);
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
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-medium">{formatCarPrimary(c)}</span>
                {shared.has(c.id) && (
                  <Badge variant="outline" title="Auto je zdieľané s iným klientom">
                    zdieľané auto
                  </Badge>
                )}
              </span>
              <span className="truncate text-muted-foreground">
                {/* When plateless, the brand/model already headlines — don't repeat it. */}
                {c.spz && formatCarLabel(c.brand, c.model) ? `${formatCarLabel(c.brand, c.model)} · ` : ""}
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
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState<PricingCategory>("os");
  const [pending, start] = useTransition();
  // Non-blocking duplicate-vehicle hint: the client name the ŠPZ is found under.
  const [dupClient, setDupClient] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const norm = normalizeSpz(spz);
      if (!norm) {
        setDupClient(null);
        return;
      }
      const results = await searchClients({ query: spz });
      const hit = results.find((r) => r.matchedSpz && normalizeSpz(r.matchedSpz) === norm);
      setDupClient(hit ? (hit.name ?? "bez mena") : null);
    }, 300);
    return () => clearTimeout(t);
  }, [spz]);

  function submit() {
    start(async () => {
      const r = await addCarToClient({
        clientId,
        spz,
        brand: brand.trim() || undefined,
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
          <DialogDescription>
            Kategória je povinná. Bez ŠPZ zadajte aspoň značku alebo model.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-car-spz">ŠPZ (nepovinné)</Label>
            <Input id="new-car-spz" value={spz} onChange={(e) => setSpz(e.target.value)} placeholder="BV123AB" />
            {dupClient && (
              <p
                data-dup-vehicle
                className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              >
                Vozidlo už existuje v systéme — klient: {dupClient}. Po pridaní sa auto prepojí.
              </p>
            )}
          </div>
          <BrandField id="new-car-brand" onChange={setBrand} />
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
          <Button
            type="button"
            onClick={submit}
            disabled={
              pending ||
              // Need a plate (≥2 chars) OR, when plateless, a brand/model to identify it.
              (spz.trim().length < 2 && !brand.trim() && !model.trim())
            }
          >
            {pending ? "Pridávam…" : "Pridať"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
