"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  updateService,
  upsertServicePrice,
  deleteServicePrice,
} from "@/lib/actions/services";
import type {
  PricingCategory,
  ServiceRow,
  ServicePriceRow,
} from "@/lib/supabase/types";
import { formatPriceCents } from "@/lib/services/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORY_ORDER: PricingCategory[] = ["os", "suv", "van", "dod", "motorka", "stavba"];
const CATEGORY_LABEL: Record<PricingCategory, string> = {
  os: "Os.",
  suv: "SUV",
  van: "Van",
  dod: "Dod.",
  motorka: "Motorka",
  stavba: "Stavba",
};

export function ServiceEditor({
  service,
  prices,
}: {
  service: ServiceRow;
  prices: ServicePriceRow[];
}) {
  const router = useRouter();
  const isAddon = service.kind === "addon";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/services" className="text-sm underline underline-offset-4">
          ← Späť na katalóg
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{service.name}</h1>
          <Badge variant="secondary">{isAddon ? "Doplnková" : "Hlavná"}</Badge>
          {service.is_per_unit && <Badge variant="secondary">/ks</Badge>}
          <Badge variant={service.active ? "outline" : "destructive"}>
            {service.active ? "Aktívna" : "Neaktívna"}
          </Badge>
        </div>
      </div>

      <ServiceDetailsForm service={service} onSaved={() => router.refresh()} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {isAddon ? "Cena a trvanie" : "Ceny pre kategórie"}
        </h2>
        {isAddon ? (
          <FlatPriceEditor serviceId={service.id} existing={prices.find((p) => p.pricing_category === null) ?? null} />
        ) : (
          <CategoryPriceGrid serviceId={service.id} prices={prices} />
        )}
      </section>
    </div>
  );
}

function ServiceDetailsForm({
  service,
  onSaved,
}: {
  service: ServiceRow;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const isPerUnit = formData.get("is_per_unit") === "on";
    const sortOrder = Number(String(formData.get("sort_order") ?? "0"));
    startTransition(async () => {
      const result = await updateService({
        id: service.id,
        name,
        isPerUnit,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
      });
      if (result.ok) {
        toast.success("Zmeny uložené.");
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4 rounded-lg border p-4">
      <div className="space-y-2">
        <Label htmlFor="name">Názov</Label>
        <Input id="name" name="name" defaultValue={service.name} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sort_order">Poradie</Label>
          <Input
            id="sort_order"
            name="sort_order"
            type="number"
            defaultValue={service.sort_order}
          />
        </div>
        <div className="flex items-end gap-2">
          <input
            id="is_per_unit"
            name="is_per_unit"
            type="checkbox"
            defaultChecked={service.is_per_unit}
          />
          <Label htmlFor="is_per_unit" className="font-normal">
            Cena za kus
          </Label>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Ukladám…" : "Uložiť"}
        </Button>
      </div>
    </form>
  );
}

function CategoryPriceGrid({
  serviceId,
  prices,
}: {
  serviceId: string;
  prices: ServicePriceRow[];
}) {
  const router = useRouter();
  const byCat = new Map<PricingCategory, ServicePriceRow>();
  for (const p of prices) if (p.pricing_category) byCat.set(p.pricing_category, p);

  return (
    <div className="space-y-2">
      {CATEGORY_ORDER.map((cat) => {
        const row = byCat.get(cat) ?? null;
        return (
          <CategoryPriceRow
            key={cat}
            serviceId={serviceId}
            category={cat}
            existing={row}
            onSaved={() => router.refresh()}
          />
        );
      })}
    </div>
  );
}

function CategoryPriceRow({
  serviceId,
  category,
  existing,
  onSaved,
}: {
  serviceId: string;
  category: PricingCategory;
  existing: ServicePriceRow | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [duration, setDuration] = useState<string>(
    existing?.duration_min == null ? "" : String(existing.duration_min),
  );
  const [price, setPrice] = useState<string>(
    existing == null ? "" : (existing.price_cents / 100).toFixed(2).replace(".", ","),
  );
  const [priceFrom, setPriceFrom] = useState<boolean>(existing?.price_from ?? false);

  function save() {
    const priceCents = Math.round(Number(price.replace(",", ".")) * 100);
    if (Number.isNaN(priceCents) || priceCents < 0) {
      toast.error("Neplatná cena.");
      return;
    }
    const durationMin = duration.trim() === "" ? null : Number(duration);
    if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin <= 0)) {
      toast.error("Neplatné trvanie.");
      return;
    }
    startTransition(async () => {
      const result = await upsertServicePrice({
        serviceId,
        pricingCategory: category,
        durationMin,
        priceCents,
        priceFrom,
      });
      if (result.ok) {
        toast.success("Uložené.");
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteServicePrice({ serviceId, pricingCategory: category });
      if (result.ok) {
        toast.success("Cena odstránená.");
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div
      className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-[80px_1fr_1fr_auto_auto]"
      data-category={category}
    >
      <div className="font-medium sm:self-center">{CATEGORY_LABEL[category]}</div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`dur-${category}`}>
          Trvanie (min)
        </Label>
        <Input
          id={`dur-${category}`}
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="—"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`price-${category}`}>
          Cena (€)
        </Label>
        <Input
          id={`price-${category}`}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={existing ? formatPriceCents(existing.price_cents) : ""}
        />
      </div>
      <label className="flex items-center gap-2 text-xs sm:self-center">
        <input
          type="checkbox"
          checked={priceFrom}
          onChange={(e) => setPriceFrom(e.target.checked)}
        />
        od
      </label>
      <div className="flex gap-2 sm:self-center">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          Uložiť
        </Button>
        {existing && (
          <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={pending}>
            Zmazať
          </Button>
        )}
      </div>
    </div>
  );
}

function FlatPriceEditor({
  serviceId,
  existing,
}: {
  serviceId: string;
  existing: ServicePriceRow | null;
}) {
  const router = useRouter();
  return (
    <CategoryPriceRowFlat
      serviceId={serviceId}
      existing={existing}
      onSaved={() => router.refresh()}
    />
  );
}

function CategoryPriceRowFlat({
  serviceId,
  existing,
  onSaved,
}: {
  serviceId: string;
  existing: ServicePriceRow | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [duration, setDuration] = useState<string>(
    existing?.duration_min == null ? "" : String(existing.duration_min),
  );
  const [price, setPrice] = useState<string>(
    existing == null ? "" : (existing.price_cents / 100).toFixed(2).replace(".", ","),
  );

  function save() {
    const priceCents = Math.round(Number(price.replace(",", ".")) * 100);
    if (Number.isNaN(priceCents) || priceCents < 0) {
      toast.error("Neplatná cena.");
      return;
    }
    const durationMin = duration.trim() === "" ? null : Number(duration);
    if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin <= 0)) {
      toast.error("Neplatné trvanie.");
      return;
    }
    startTransition(async () => {
      const result = await upsertServicePrice({
        serviceId,
        pricingCategory: null,
        durationMin,
        priceCents,
        priceFrom: false,
      });
      if (result.ok) {
        toast.success("Uložené.");
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="dur-flat">
          Trvanie (min)
        </Label>
        <Input
          id="dur-flat"
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="—"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="price-flat">
          Cena (€)
        </Label>
        <Input
          id="price-flat"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="flex items-end">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Ukladám…" : "Uložiť"}
        </Button>
      </div>
    </div>
  );
}
