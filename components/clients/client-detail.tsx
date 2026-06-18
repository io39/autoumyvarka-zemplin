"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Settings, Trash2 } from "lucide-react";
import { updateClient, deleteClient } from "@/lib/actions/clients";
import { addCarToClient, linkExistingCar } from "@/lib/actions/cars";
import type {
  CarRow,
  ClientRow,
  PricingCategory,
  StaffRole,
} from "@/lib/supabase/types";
import type { CarHistory, HistoryEntry } from "@/lib/clients/history";
import { poradieFor } from "@/lib/clients/history";
import { formatCarLabel, formatCarPrimary } from "@/lib/cars/format";
import type { ClientFlags } from "@/lib/orders/unpaid";
import { BrandField } from "@/components/cars/brand-field";
import { CategorySelect, CATEGORY_LABEL } from "@/components/cars/category-select";
import { EditCarDialog } from "@/components/cars/edit-car-dialog";
import { ClientFlagBadges } from "@/components/clients/client-flag-badges";
import { STATE_COLOR, STATE_LABEL } from "@/types";
import { cn } from "@/lib/utils";
import { formatPriceCents } from "@/lib/services/format";
import { bratislavaHHMM, bratislavaDateDisplay } from "@/lib/settings/availability";
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

/** Digits-only phone for tel:/sms: hrefs (keeps a leading +). */
function telHref(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function ClientDetail({
  client,
  histories,
  role,
  flags,
}: {
  client: ClientRow;
  histories: CarHistory[];
  role: StaffRole;
  flags: ClientFlags;
}) {
  const router = useRouter();
  const isManager = role === "manazer";
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [addCarOpen, setAddCarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editCar, setEditCar] = useState<CarRow | null>(null);

  return (
    <div className="space-y-6">
      <ClientHeaderCard
        client={client}
        flags={flags}
        isManager={isManager}
        onEdit={() => setEditClientOpen(true)}
        onAddCar={() => setAddCarOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />

      <section className="space-y-3" data-section="history">
        <h2 className="text-lg font-medium">Autá a história</h2>
        {histories.length === 0 ? (
          <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
            Žiadne autá
          </p>
        ) : (
          <div className="space-y-3">
            {histories.map((h, i) => (
              // Each vehicle is its own grouped block with an alternating tint so
              // it's immediately clear which orders belong to which car.
              <Accordion
                key={h.car.id}
                type="multiple"
                // Open every car block by default so the visit list shows
                // immediately; the user can collapse any block they don't need.
                defaultValue={[h.car.id]}
                data-car-block={h.car.id}
                className={cn(
                  "overflow-hidden rounded-lg border px-4",
                  i % 2 === 0 ? "bg-muted/30" : "bg-muted/60",
                )}
              >
                <CarRow
                  history={h}
                  isManager={isManager}
                  onEditCar={() => setEditCar(h.car)}
                />
              </Accordion>
            ))}
          </div>
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

      {isManager && (
        <DeleteClientDialog
          client={client}
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            // Client is gone — leave the detail and clear ?id=.
            setDeleteOpen(false);
            router.push("/clients");
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

function ClientHeaderCard({
  client,
  flags,
  isManager,
  onEdit,
  onAddCar,
  onDelete,
}: {
  client: ClientRow;
  flags: ClientFlags;
  isManager: boolean;
  onEdit: () => void;
  onAddCar: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="rounded-lg border p-4" data-section="client">
      <h1 className="text-xl font-semibold">{client.name ?? "(bez mena)"}</h1>
      <ClientFlagBadges flags={flags} className="mt-2" />
      <p className="mt-0.5 text-sm">
        <a href={`tel:${telHref(client.phone)}`} className="text-primary hover:underline">
          {client.phone}
        </a>
        <span className="mx-2 text-muted-foreground">·</span>
        <a href={`sms:${telHref(client.phone)}`} className="text-primary hover:underline">
          SMS
        </a>
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* All roles — available even with no cars (the wizard can add one).
            On mobile the labels collapse to icons to leave room for Odstrániť. */}
        <Button size="sm" asChild>
          <Link href={`/orders/new?clientId=${client.id}`} aria-label="Nová rezervácia">
            <Plus className="size-4 sm:hidden" />
            <span className="hidden sm:inline">Nová rezervácia</span>
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={onAddCar}>
          Pridať auto
        </Button>
        {isManager && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label="Upraviť klienta"
            title="Upraviť klienta"
          >
            <Settings className="size-4 sm:hidden" />
            <span className="hidden sm:inline">Upraviť klienta</span>
          </Button>
        )}
        {isManager && (
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            onClick={onDelete}
            data-action="delete-client"
          >
            <Trash2 className="size-4" />
            Odstrániť
          </Button>
        )}
      </div>
    </section>
  );
}

function CarRow({
  history,
  isManager,
  onEditCar,
}: {
  history: CarHistory;
  isManager: boolean;
  onEditCar: () => void;
}) {
  const { car, shared, entries } = history;
  return (
    <AccordionItem value={car.id} data-car-id={car.id}>
      <div className="flex items-center gap-2">
        <AccordionTrigger className="flex-1 hover:no-underline">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{formatCarPrimary(car)}</span>
            {car.spz && formatCarLabel(car.brand, car.model) && (
              <span className="text-muted-foreground">{formatCarLabel(car.brand, car.model)}</span>
            )}
            <Badge variant="secondary">{CATEGORY_LABEL[car.pricing_category]}</Badge>
            {shared && (
              <Badge variant="outline" title="Auto je zdieľané s iným klientom">
                zdieľané auto
              </Badge>
            )}
            <span className="text-xs font-normal text-muted-foreground">
              {entries.length === 0 ? "Žiadne služby." : `${entries.length}×`}
            </span>
          </span>
        </AccordionTrigger>
        {isManager && (
          <Button variant="ghost" size="sm" onClick={onEditCar}>
            Upraviť auto
          </Button>
        )}
      </div>
      {/* The "Žiadne služby." hint already shows in the trigger above; the
          expanded content only lists visits when there are any. */}
      {entries.length > 0 && (
        <AccordionContent>
          {/* Open every visit's detail by default too, so order info (box, total,
              workers, note) shows without an extra click; collapsible per visit. */}
          <Accordion
            type="multiple"
            defaultValue={entries.map((e) => e.orderId)}
            className="border-t"
          >
            {entries.map((e, i) => (
              <ServiceHistoryRow
                key={e.orderId}
                entry={e}
                poradie={poradieFor(entries, i)}
              />
            ))}
          </Accordion>
        </AccordionContent>
      )}
    </AccordionItem>
  );
}

function ServiceHistoryRow({ entry, poradie }: { entry: HistoryEntry; poradie: number }) {
  const start = new Date(entry.startsAt);
  const end = new Date(entry.endsAt);
  const style = STATE_COLOR[entry.status];
  return (
    <AccordionItem value={entry.orderId} data-order-id={entry.orderId}>
      <AccordionTrigger className="py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {poradie}. · {bratislavaDateDisplay(start)} · {bratislavaHHMM(start)}–
              {bratislavaHHMM(end)}
            </span>
            {/* nedostavil_sa renders plain gray — STATE_COLOR carries no
                strike-through/opacity here (spec 13). */}
            <Badge className={`border ${style.bg} ${style.border} ${style.text}`}>
              {STATE_LABEL[entry.status]}
            </Badge>
          </span>
          {entry.services.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {entry.services.map((s, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  <span className={s.removed ? "line-through" : ""}>
                    {s.name}
                    {s.quantity > 1 && ` ×${s.quantity}`}
                  </span>
                </span>
              ))}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-2 pb-1 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>Box {entry.box}</span>
            <span>Cena spolu: {formatPriceCents(entry.totalCents)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Pracovníci: </span>
            {entry.workers.length > 0 ? entry.workers.join(", ") : "—"}
          </div>
          {entry.note && (
            <div>
              <span className="text-muted-foreground">Poznámka: </span>
              {entry.note}
            </div>
          )}
          <Link
            href={`/orders/${entry.orderId}`}
            className="inline-block font-medium text-primary hover:underline"
          >
            Otvoriť objednávku →
          </Link>
        </div>
      </AccordionContent>
    </AccordionItem>
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
    startTransition(async () => {
      const result = await updateClient({
        id: client.id,
        phone,
        name: name || undefined,
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

function DeleteClientDialog({
  client,
  open,
  onClose,
  onDeleted,
}: {
  client: ClientRow;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteClient({ id: client.id });
      if (result.ok) {
        const orders = result.deletedOrders ?? 0;
        const cars = result.deletedCars ?? 0;
        toast.success(
          `Zákazník odstránený · ${orders} objednávok a ${cars} áut zmazaných.`,
        );
        onDeleted();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Natrvalo odstrániť zákazníka?</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              Týmto sa <strong>natrvalo</strong> odstráni zákazník{" "}
              {client.name ?? client.phone} vrátane <strong>všetkých jeho objednávok</strong> a
              celej histórie služieb. Odstránia sa aj jeho autá — okrem áut zdieľaných s iným
              klientom, ktoré zostanú zachované.
            </span>
            <span className="block font-medium text-destructive">
              Túto akciu nie je možné vrátiť späť.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Zrušiť
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "Odstraňujem…" : "Natrvalo odstrániť"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    const brand = String(formData.get("brand") ?? "");
    const model = String(formData.get("model") ?? "");
    const pricingCategory = String(formData.get("pricingCategory") ?? "os") as PricingCategory;
    startTransition(async () => {
      const result = await addCarToClient({
        clientId,
        spz,
        brand: brand || undefined,
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
              <DialogDescription>
                Kategória je povinná. Bez ŠPZ zadajte aspoň značku alebo model.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="spz">ŠPZ (nepovinné)</Label>
                <Input id="spz" name="spz" placeholder="BV123AB" />
              </div>
              <BrandField id="add-car-brand" name="brand" />
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

