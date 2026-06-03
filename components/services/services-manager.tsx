"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createService,
  setServiceActive,
  type ServiceWithPrices,
} from "@/lib/actions/services";
import type { PricingCategory, ServiceKind } from "@/lib/supabase/types";
import { formatPriceCents } from "@/lib/services/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

const CATEGORY_ORDER: PricingCategory[] = ["os", "suv", "van", "dod", "motorka", "stavba"];
const CATEGORY_LABEL: Record<PricingCategory, string> = {
  os: "Os.",
  suv: "SUV",
  van: "Van",
  dod: "Dod.",
  motorka: "Motorka",
  stavba: "Stavba",
};

export function ServicesManager({
  initialServices,
}: {
  initialServices: ServiceWithPrices[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(
    () => (showInactive ? initialServices : initialServices.filter((s) => s.service.active)),
    [initialServices, showInactive],
  );
  const mains = visible.filter((s) => s.service.kind === "main");
  const addons = visible.filter((s) => s.service.kind === "addon");

  function toggleActive(item: ServiceWithPrices) {
    startTransition(async () => {
      const result = await setServiceActive({
        id: item.service.id,
        active: !item.service.active,
      });
      if (result.ok) {
        toast.success(item.service.active ? "Služba deaktivovaná." : "Služba aktivovaná.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Katalóg služieb</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Skryť neaktívne" : "Zobraziť neaktívne"}
          </Button>
          <Button onClick={() => setAdding(true)}>Pridať službu</Button>
        </div>
      </div>

      {/* Hlavné / Doplnkové wrapped in expandable accordions (spec 18 §2.1),
          default-expanded so the catalog is visible at a glance. */}
      <Accordion type="multiple" defaultValue={["main", "addon"]} className="rounded-lg border px-4">
        <Section value="main" title="Hlavné služby" items={mains} pending={pending} onToggle={toggleActive} />
        <Section value="addon" title="Doplnkové služby" items={addons} pending={pending} onToggle={toggleActive} />
      </Accordion>

      <NewServiceDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function Section({
  value,
  title,
  items,
  pending,
  onToggle,
}: {
  value: string;
  title: string;
  items: ServiceWithPrices[];
  pending: boolean;
  onToggle: (item: ServiceWithPrices) => void;
}) {
  // Radix AccordionHeader renders an <h3>, so `title` stays a real heading.
  return (
    <AccordionItem value={value} data-section={value}>
      <AccordionTrigger className="text-sm font-medium hover:no-underline">
        <span className="flex items-center gap-2">
          {title}
          <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {items.length === 0 ? (
          <p className="pb-2 text-sm text-muted-foreground">Žiadne služby.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <ServiceCard key={item.service.id} item={item} pending={pending} onToggle={onToggle} />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function ServiceCard({
  item,
  pending,
  onToggle,
}: {
  item: ServiceWithPrices;
  pending: boolean;
  onToggle: (item: ServiceWithPrices) => void;
}) {
  const { service, prices } = item;
  const concrete = prices.filter((p) => p.pricing_category !== null);
  const flat = prices.find((p) => p.pricing_category === null);

  return (
    <article
      data-service-id={service.id}
      className={`rounded-lg border p-3 sm:p-4 ${service.active ? "" : "opacity-60"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{service.name}</h3>
            {service.is_per_unit && <Badge variant="secondary">/ks</Badge>}
            <Badge variant={service.active ? "outline" : "destructive"}>
              {service.active ? "Aktívna" : "Neaktívna"}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/services/${service.id}`}>Upraviť</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onToggle(item)}
          >
            {service.active ? "Deaktivovať" : "Aktivovať"}
          </Button>
        </div>
      </div>

      {concrete.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          {CATEGORY_ORDER.map((cat) => {
            const row = concrete.find((p) => p.pricing_category === cat);
            if (!row) return null;
            return (
              <div key={cat} className="rounded border px-2 py-1 text-xs">
                <div className="font-medium">{CATEGORY_LABEL[cat]}</div>
                <div className="text-muted-foreground">
                  {formatPriceCents(row.price_cents, { from: row.price_from })}
                </div>
                <div className="text-muted-foreground">
                  {row.duration_min === null ? "—" : `${row.duration_min} min`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {flat && (
        <div className="mt-3 text-sm">
          <span className="font-medium">
            {formatPriceCents(flat.price_cents, { from: flat.price_from })}
          </span>
          <span className="ml-2 text-muted-foreground">
            {flat.duration_min === null ? "bez trvania" : `${flat.duration_min} min`}
          </span>
        </div>
      )}

      {prices.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">Bez nastavených cien.</p>
      )}
    </article>
  );
}

function NewServiceDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const kind = String(formData.get("kind") ?? "main") as ServiceKind;
    const isPerUnit = formData.get("is_per_unit") === "on";
    const durationRaw = String(formData.get("duration_min") ?? "").trim();
    const priceRaw = String(formData.get("price_cents") ?? "").trim();
    const category = String(formData.get("category") ?? "");

    const priceCents = Math.round(Number(priceRaw.replace(",", ".")) * 100);
    const durationMin = durationRaw === "" ? null : Number(durationRaw);

    if (Number.isNaN(priceCents) || priceCents < 0) {
      toast.error("Neplatná cena.");
      return;
    }
    if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin <= 0)) {
      toast.error("Neplatné trvanie.");
      return;
    }

    const prices = [
      {
        pricingCategory: kind === "addon" ? null : (category as PricingCategory),
        durationMin,
        priceCents,
        priceFrom: false,
      },
    ];

    startTransition(async () => {
      const result = await createService({ name, kind, isPerUnit, prices });
      if (result.ok) {
        toast.success("Služba pridaná.");
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form action={onSubmit}>
          <DialogHeader>
            <DialogTitle>Pridať službu</DialogTitle>
            <DialogDescription>
              Pridajte základnú alebo doplnkovú službu. Ďalšie ceny pre kategórie pridáte v
              detaile služby.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Názov</Label>
              <Input id="name" name="name" required autoComplete="off" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kind">Typ</Label>
              <Select name="kind" defaultValue="main">
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Hlavná</SelectItem>
                  <SelectItem value="addon">Doplnková</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Kategória vozidla (pre hlavné služby)</Label>
              <Select name="category" defaultValue="os">
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="duration_min">Trvanie (min)</Label>
                <Input id="duration_min" name="duration_min" inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price_cents">Cena (€)</Label>
                <Input id="price_cents" name="price_cents" inputMode="decimal" required />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="is_per_unit" name="is_per_unit" type="checkbox" />
              <Label htmlFor="is_per_unit" className="font-normal">
                Cena za kus (/ks)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukladám…" : "Pridať"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
