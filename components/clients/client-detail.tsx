"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateClient } from "@/lib/actions/clients";
import { addCarToClient, linkExistingCar, updateCar } from "@/lib/actions/cars";
import type {
  CarRow,
  ClientRow,
  OrderStatus,
  PricingCategory,
  StaffRole,
} from "@/lib/supabase/types";
import type { CarHistory } from "@/lib/clients/history";
import { STATUS_STYLE } from "@/lib/orders/colors";
import { bratislavaHHMM, bratislavaDateKey } from "@/lib/settings/availability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// Status badge styling for the read-only history. STATUS_STYLE[*].bg can't be
// reused here: those classes were authored for the calendar block container and
// carry hover/opacity/line-through (esp. nedostavil_sa), which would strike
// through and fade the badge label. Clean bg/text/border per PRD §5.1 — grey
// no-show, no strike-through. (STATUS_STYLE still supplies the Slovak label.)
const HISTORY_STATUS_BADGE: Record<OrderStatus, string> = {
  vytvorena: "bg-amber-100 text-amber-900 border-amber-300",
  hotova: "bg-sky-100 text-sky-900 border-sky-300",
  zaplatena: "bg-emerald-100 text-emerald-900 border-emerald-300",
  nedostavil_sa: "bg-zinc-200 text-zinc-700 border-zinc-400",
};

export function ClientDetail({
  client,
  cars,
  histories,
  role,
}: {
  client: ClientRow;
  cars: CarRow[];
  histories: CarHistory[];
  role: StaffRole;
}) {
  const router = useRouter();
  const isManager = role === "manazer";
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [addCarOpen, setAddCarOpen] = useState(false);
  const [editCar, setEditCar] = useState<CarRow | null>(null);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{client.name ?? "(bez mena)"}</h1>
            <p className="text-sm text-muted-foreground">{client.phone}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cars.length > 0 && (
              <Button size="sm" asChild>
                <Link href={`/orders/new?clientId=${client.id}`}>
                  Nová objednávka
                </Link>
              </Button>
            )}
            {isManager && (
              <Button variant="ghost" size="sm" onClick={() => setEditClientOpen(true)}>
                Upraviť
              </Button>
            )}
          </div>
        </div>
        {client.note && <p className="mt-3 text-sm">{client.note}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Autá</h2>
          <Button size="sm" onClick={() => setAddCarOpen(true)}>
            Pridať auto
          </Button>
        </div>
        <div className="rounded-lg border">
          {cars.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Žiadne autá</p>
          ) : (
            <ul className="divide-y">
              {cars.map((car) => (
                <li key={car.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <span className="font-medium">{car.spz}</span>
                    {car.model && (
                      <span className="ml-2 text-sm text-muted-foreground">{car.model}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{CATEGORY_LABEL[car.pricing_category]}</Badge>
                    {isManager && (
                      <Button variant="ghost" size="sm" onClick={() => setEditCar(car)}>
                        Upraviť
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3" data-section="history">
        <h2 className="text-lg font-medium">História návštev</h2>
        {histories.length === 0 ? (
          <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
            Žiadne autá
          </p>
        ) : (
          histories.map((h) => <CarHistorySection key={h.car.id} history={h} />)
        )}
      </section>

      {isManager && (
        <EditClientDialog
          client={client}
          open={editClientOpen}
          onClose={() => setEditClientOpen(false)}
          onSaved={() => {
            setEditClientOpen(false);
            router.refresh();
          }}
        />
      )}

      <AddCarDialog
        clientId={client.id}
        open={addCarOpen}
        onClose={() => setAddCarOpen(false)}
        onChanged={() => {
          setAddCarOpen(false);
          router.refresh();
        }}
      />

      {isManager && editCar && (
        <EditCarDialog
          car={editCar}
          onClose={() => setEditCar(null)}
          onSaved={() => {
            setEditCar(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CarHistorySection({ history }: { history: CarHistory }) {
  const { car, shared, entries } = history;
  return (
    <div className="rounded-lg border" data-car-id={car.id}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <span className="font-medium">{car.spz}</span>
        {car.model && (
          <span className="text-sm text-muted-foreground">{car.model}</span>
        )}
        {shared && (
          <Badge variant="outline" title="Auto je zdieľané s iným klientom">
            zdieľané auto
          </Badge>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Zatiaľ žiadna história
        </p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => {
            const date = new Date(e.startsAt);
            const style = STATUS_STYLE[e.status];
            return (
              <li key={e.orderId}>
                <Link
                  href={`/orders/${e.orderId}`}
                  className="block px-4 py-3 hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {bratislavaDateKey(date)} · {bratislavaHHMM(date)}
                    </span>
                    <Badge className={`${HISTORY_STATUS_BADGE[e.status]} border`}>
                      {style.label}
                    </Badge>
                  </div>
                  {e.services.length > 0 && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {e.services.map((s, i) => (
                        <span key={i}>
                          {i > 0 && ", "}
                          <span className={s.removed ? "line-through" : ""}>
                            {s.name}
                            {s.quantity > 1 && ` ×${s.quantity}`}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  {e.workers.length > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Pracovníci: {e.workers.join(", ")}
                    </div>
                  )}
                  {e.note && <div className="mt-1 text-sm">{e.note}</div>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EditClientDialog({
  client,
  open,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const phone = String(formData.get("phone") ?? "");
    const name = String(formData.get("name") ?? "");
    const note = String(formData.get("note") ?? "");
    startTransition(async () => {
      const result = await updateClient({
        id: client.id,
        phone,
        name: name || undefined,
        note: note || undefined,
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form action={onSubmit}>
          <DialogHeader>
            <DialogTitle>Upraviť klienta</DialogTitle>
            <DialogDescription>Zmena telefónu je povolená (zmena sa zaznamená).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefón</Label>
              <Input id="phone" name="phone" type="tel" required defaultValue={client.phone} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Meno</Label>
              <Input id="name" name="name" defaultValue={client.name ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Poznámka</Label>
              <Input id="note" name="note" defaultValue={client.note ?? ""} />
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

function CategorySelect({ defaultValue }: { defaultValue?: PricingCategory }) {
  return (
    <Select name="pricingCategory" defaultValue={defaultValue ?? "os"}>
      <SelectTrigger id="pricingCategory">
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
  );
}

function AddCarDialog({
  clientId,
  open,
  onClose,
  onChanged,
}: {
  clientId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [linkConfirm, setLinkConfirm] = useState<CarRow | null>(null);

  function onSubmit(formData: FormData) {
    const spz = String(formData.get("spz") ?? "");
    const model = String(formData.get("model") ?? "");
    const pricingCategory = String(formData.get("pricingCategory") ?? "os") as PricingCategory;
    startTransition(async () => {
      const result = await addCarToClient({
        clientId,
        spz,
        model: model || undefined,
        pricingCategory,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if ("needsLinkConfirm" in result) {
        setLinkConfirm(result.existingCar);
        return;
      }
      if ("alreadyLinked" in result) {
        toast.info("Toto auto je už priradené tomuto klientovi.");
        onChanged();
        return;
      }
      toast.success("Auto pridané.");
      onChanged();
    });
  }

  function confirmLink() {
    if (!linkConfirm) return;
    startTransition(async () => {
      const result = await linkExistingCar({ clientId, carId: linkConfirm.id });
      if (result.ok) {
        toast.success("Auto prepojené s klientom.");
        setLinkConfirm(null);
        onChanged();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setLinkConfirm(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {linkConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle>ŠPZ už existuje</DialogTitle>
              <DialogDescription>
                ŠPZ {linkConfirm.spz} už existuje u iného klienta. Prepojiť toto auto aj s týmto
                klientom?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setLinkConfirm(null)}>
                Zrušiť
              </Button>
              <Button type="button" disabled={pending} onClick={confirmLink}>
                {pending ? "Prepájam…" : "Prepojiť"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Pridať auto</DialogTitle>
              <DialogDescription>ŠPZ a kategória sú povinné.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="spz">ŠPZ</Label>
                <Input id="spz" name="spz" required placeholder="BV123AB" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" name="model" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricingCategory">Kategória</Label>
                <CategorySelect />
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
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditCarDialog({
  car,
  onClose,
  onSaved,
}: {
  car: CarRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const model = String(formData.get("model") ?? "");
    const pricingCategory = String(formData.get("pricingCategory") ?? "os") as PricingCategory;
    startTransition(async () => {
      const result = await updateCar({ id: car.id, model: model || undefined, pricingCategory });
      if (result.ok) {
        toast.success("Zmeny uložené.");
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form action={onSubmit}>
          <DialogHeader>
            <DialogTitle>Upraviť auto {car.spz}</DialogTitle>
            <DialogDescription>ŠPZ sa nedá zmeniť; upravte model a kategóriu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
      </DialogContent>
    </Dialog>
  );
}
