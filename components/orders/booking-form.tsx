"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOrder,
  suggestSlots,
} from "@/lib/actions/orders";
import type { ServiceWithPrices } from "@/lib/actions/services";
import type { CarRow, ClientRow, PricingCategory } from "@/lib/supabase/types";
import { resolveServicePrice } from "@/lib/services/price-lookup";
import { formatPriceCents } from "@/lib/services/format";
import { bratislavaLocalToISO } from "@/lib/time/bratislava";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  client: ClientRow;
  cars: CarRow[];
  services: ServiceWithPrices[];
  preselectedCarId?: string;
  date?: string;
}

interface Selection {
  serviceId: string;
  quantity: number;
}

function defaultDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
}

export function BookingForm({ client, cars, services, preselectedCarId, date }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [carId, setCarId] = useState<string | "">(
    preselectedCarId ?? (cars[0]?.id ?? ""),
  );
  const [box, setBox] = useState<1 | 2>(1);
  const [selDate, setSelDate] = useState(date ?? defaultDate());
  const [selTime, setSelTime] = useState("09:00");
  const [selections, setSelections] = useState<Selection[]>([]);
  const [overrideMin, setOverrideMin] = useState<string>("");
  const [suggesting, setSuggesting] = useState(false);

  const car = useMemo(() => cars.find((c) => c.id === carId) ?? null, [cars, carId]);
  const category: PricingCategory | null = car?.pricing_category ?? null;

  const resolvedLines = useMemo(() => {
    if (!category) return [];
    return selections.map((sel) => {
      const svc = services.find((s) => s.service.id === sel.serviceId);
      if (!svc) return null;
      const r = resolveServicePrice(svc.prices, category);
      if (!r.ok) {
        return { sel, svc, durationMin: 0, priceCents: 0, priceFrom: false, unavailable: true };
      }
      return {
        sel,
        svc,
        durationMin: (r.durationMin ?? 0) * sel.quantity,
        priceCents: r.priceCents * sel.quantity,
        priceFrom: r.priceFrom,
        unavailable: false,
      };
    }).filter(Boolean) as Array<{
      sel: Selection;
      svc: ServiceWithPrices;
      durationMin: number;
      priceCents: number;
      priceFrom: boolean;
      unavailable: boolean;
    }>;
  }, [selections, category, services]);

  const totalDuration = useMemo(() => {
    const sum = resolvedLines.reduce((a, l) => a + l.durationMin, 0);
    const override = Number(overrideMin);
    return Number.isFinite(override) && override > 0 ? override : sum;
  }, [resolvedLines, overrideMin]);

  const totalPrice = useMemo(
    () => resolvedLines.reduce((a, l) => a + l.priceCents, 0),
    [resolvedLines],
  );

  const finishLocalHHMM = useMemo(() => {
    if (totalDuration <= 0) return "";
    const [h, m] = selTime.split(":").map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + totalDuration;
    return `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  }, [selTime, totalDuration]);

  function toggle(serviceId: string) {
    setSelections((prev) => {
      const found = prev.find((s) => s.serviceId === serviceId);
      if (found) return prev.filter((s) => s.serviceId !== serviceId);
      return [...prev, { serviceId, quantity: 1 }];
    });
  }

  function setQty(serviceId: string, qty: number) {
    setSelections((prev) =>
      prev.map((s) => (s.serviceId === serviceId ? { ...s, quantity: Math.max(1, qty) } : s)),
    );
  }

  async function fetchSuggestions() {
    if (totalDuration <= 0) {
      toast.error("Najprv vyberte aspoň jednu službu.");
      return;
    }
    setSuggesting(true);
    try {
      const slots = await suggestSlots({
        date: selDate,
        durationMin: totalDuration,
        limit: 6,
      });
      if (slots.length === 0) {
        toast.error("V tento deň nie sú voľné termíny.");
        return;
      }
      // Pick the first slot in box 1 if available, else any.
      const pick = slots.find((s) => s.box === box) ?? slots[0];
      setBox(pick.box as 1 | 2);
      setSelTime(pick.localStart);
      toast.success(`Navrhnutý termín: Box ${pick.box} ${pick.localStart}.`);
    } finally {
      setSuggesting(false);
    }
  }

  function submit() {
    if (!carId) {
      toast.error("Vyberte auto.");
      return;
    }
    if (selections.length === 0) {
      toast.error("Vyberte aspoň jednu službu.");
      return;
    }
    const startsAtUtc = bratislavaLocalToISO(selDate, selTime);
    startTransition(async () => {
      const override = Number(overrideMin);
      const result = await createOrder({
        clientId: client.id,
        carId,
        box,
        startsAt: startsAtUtc,
        services: selections,
        durationOverrideMin: Number.isFinite(override) && override > 0 ? override : undefined,
      });
      if (result.ok) {
        toast.success("Objednávka vytvorená.");
        router.push(`/?date=${selDate}`);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm underline underline-offset-4">
          ← Späť na kalendár
        </Link>
        <h1 className="text-xl font-semibold">Nová objednávka</h1>
        <p className="text-sm text-muted-foreground">
          Klient: {client.name ?? "—"} ({client.phone})
        </p>
      </div>

      <section className="space-y-2 rounded-lg border p-3">
        <Label htmlFor="car">Auto</Label>
        {cars.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Klient nemá auto.{" "}
            <Link
              href={`/clients/${client.id}`}
              className="underline underline-offset-4"
            >
              Pridať auto →
            </Link>
          </p>
        )}
        {cars.length > 0 && (
          <Select value={carId} onValueChange={(v) => setCarId(v)}>
            <SelectTrigger id="car">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cars.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.spz}
                  {c.model ? ` — ${c.model}` : ""} ({c.pricing_category})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-3">
        <h2 className="text-sm font-medium">Služby</h2>
        <ServiceGroup
          title="Hlavné"
          items={services.filter((s) => s.service.kind === "main")}
          category={category}
          selections={selections}
          onToggle={toggle}
          onQty={setQty}
        />
        <ServiceGroup
          title="Doplnkové"
          items={services.filter((s) => s.service.kind === "addon")}
          category={category}
          selections={selections}
          onToggle={toggle}
          onQty={setQty}
        />
      </section>

      <section className="space-y-3 rounded-lg border p-3">
        <h2 className="text-sm font-medium">Termín</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="date">Dátum</Label>
            <Input
              id="date"
              type="date"
              value={selDate}
              onChange={(e) => setSelDate(e.target.value)}
              lang="sk-SK"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="time">Čas</Label>
            <Input
              id="time"
              type="time"
              step={900}
              value={selTime}
              onChange={(e) => setSelTime(e.target.value)}
              lang="sk-SK"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="box">Box</Label>
            <Select value={String(box)} onValueChange={(v) => setBox(Number(v) as 1 | 2)}>
              <SelectTrigger id="box">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Box 1</SelectItem>
                <SelectItem value="2">Box 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="override">Trvanie (min, voliteľné)</Label>
            <Input
              id="override"
              inputMode="numeric"
              value={overrideMin}
              onChange={(e) => setOverrideMin(e.target.value)}
              placeholder={String(totalDuration)}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={fetchSuggestions}
          disabled={suggesting}
        >
          {suggesting ? "Hľadám…" : "Navrhnúť termín"}
        </Button>
      </section>

      <section className="rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            Trvanie: <span className="font-medium">{totalDuration} min</span>
            {finishLocalHHMM && (
              <span className="ml-2 text-muted-foreground">
                ({selTime} → {finishLocalHHMM})
              </span>
            )}
          </div>
          <div>
            Cena spolu:{" "}
            <span className="font-medium">{formatPriceCents(totalPrice)}</span>
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" asChild>
          <Link href="/">Zrušiť</Link>
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Vytváram…" : "Vytvoriť"}
        </Button>
      </div>
    </div>
  );
}

function ServiceGroup({
  title,
  items,
  category,
  selections,
  onToggle,
  onQty,
}: {
  title: string;
  items: ServiceWithPrices[];
  category: PricingCategory | null;
  selections: Selection[];
  onToggle: (id: string) => void;
  onQty: (id: string, qty: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase text-muted-foreground">{title}</h3>
      <div className="space-y-1">
        {items.map((it) => {
          const sel = selections.find((s) => s.serviceId === it.service.id);
          const price = category ? resolveServicePrice(it.prices, category) : null;
          const unavailable = price !== null && !price.ok;
          return (
            <label
              key={it.service.id}
              data-service-id={it.service.id}
              className={`flex items-center gap-2 rounded border p-2 text-sm ${
                unavailable ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={!!sel}
                onChange={() => onToggle(it.service.id)}
                disabled={unavailable}
              />
              <span className="flex-1 truncate">{it.service.name}</span>
              {price?.ok && (
                <Badge variant="secondary" className="text-[10px]">
                  {price.durationMin ?? "—"} min ·{" "}
                  {formatPriceCents(price.priceCents, { from: price.priceFrom })}
                </Badge>
              )}
              {sel && it.service.is_per_unit && (
                <Input
                  className="w-16"
                  inputMode="numeric"
                  value={sel.quantity}
                  onChange={(e) =>
                    onQty(it.service.id, Number(e.target.value || 1))
                  }
                />
              )}
              {unavailable && (
                <span className="text-xs text-muted-foreground">nedostupné</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

