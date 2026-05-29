"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addOrderService,
  addOrderWorker,
  deleteOrder,
  moveOrder,
  removeOrderService,
  removeOrderWorker,
  setNote,
  setOrderServicePaid,
  setStatus,
  type OrderDetail,
} from "@/lib/actions/orders";
import { allowedNextStatuses } from "@/lib/orders/transitions";
import { STATUS_STYLE } from "@/lib/orders/colors";
import { bratislavaHHMM, bratislavaDateKey } from "@/lib/settings/availability";
import { bratislavaLocalToISO } from "@/lib/time/bratislava";
import type {
  OrderStatus,
  SmsMessageRow,
  StaffRole,
  WorkerRow,
} from "@/lib/supabase/types";
import { resendSms } from "@/lib/actions/sms";
import { SMS_TYPE_LABEL } from "@/lib/sms/render";
import type { ServiceWithPrices } from "@/lib/actions/services";
import { formatPriceCents } from "@/lib/services/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
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

type WorkerLite = Pick<WorkerRow, "id" | "display_name" | "active">;

interface Props {
  role: StaffRole;
  detail: OrderDetail;
  allWorkers: WorkerLite[];
  services: ServiceWithPrices[];
  sms: SmsMessageRow[];
}

const STATUS_LABEL_BUTTON: Record<OrderStatus, string> = {
  vytvorena: "Označiť ako vytvorenú",
  hotova: "Označiť ako hotovú",
  zaplatena: "Označiť ako zaplatenú",
  nedostavil_sa: "Označiť ako nedostavil sa",
};

export function OrderDetailView({ role, detail, allWorkers, services, sms }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { order, client, car } = detail;
  const isManager = role === "manazer";
  const activeServices = detail.services.filter((s) => !s.removed_at);
  const totalCents = activeServices.reduce(
    (a, l) => a + l.price_cents_snapshot,
    0,
  );

  const startHHMM = bratislavaHHMM(new Date(order.starts_at));
  const endHHMM = bratislavaHHMM(new Date(order.ends_at));
  const dateKey = bratislavaDateKey(new Date(order.starts_at));
  const statusStyle = STATUS_STYLE[order.status];
  const nextStatuses = allowedNextStatuses(order.status, role);

  const assignableWorkers = allWorkers.filter(
    (w0) => !detail.workers.some((w) => w.worker_id === w0.id),
  );

  function call<T extends { ok: boolean; message?: string }>(
    label: string,
    fn: () => Promise<T>,
  ) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(label);
        router.refresh();
      } else {
        toast.error(r.message ?? "Operácia zlyhala.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href={`/?date=${dateKey}`}
            className="text-sm underline underline-offset-4"
          >
            ← Späť na kalendár
          </Link>
          <h1 className="text-xl font-semibold">Objednávka</h1>
          {isManager && (
            <Link
              href={`/audit?orderId=${order.id}`}
              className="text-xs underline underline-offset-4"
            >
              História zmien →
            </Link>
          )}
        </div>
        <Badge className={`${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.label}
        </Badge>
      </header>

      <section className="rounded-lg border p-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Klient</div>
            <div className="font-medium">{client.name ?? "—"}</div>
            <div className="text-muted-foreground">{client.phone}</div>
            <Link
              href={`/clients/${client.id}`}
              className="text-xs underline underline-offset-4"
            >
              História klienta →
            </Link>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Auto</div>
            <div className="font-medium">{car.spz}</div>
            <div className="text-muted-foreground">
              {car.model ?? "—"} ({car.pricing_category})
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span>Box {order.box}</span>
          <span>·</span>
          <span>
            {startHHMM}–{endHHMM} ({order.duration_min} min)
          </span>
          <span>·</span>
          <span>{dateKey}</span>
        </div>
      </section>

      {/* Note — prominent (PRD §7). Workers see it but cannot edit. */}
      <NoteSection
        note={order.note}
        canEdit={isManager}
        onSave={(value) =>
          call("Poznámka uložená.", () => setNote({ id: order.id, note: value }))
        }
      />

      <section className="space-y-2 rounded-lg border p-3">
        <h2 className="text-sm font-medium">Stav</h2>
        <div className="flex flex-wrap items-center gap-2">
          {nextStatuses.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Žiadne ďalšie akcie pre tento stav.
            </span>
          )}
          {nextStatuses.map((next) => (
            <Button
              key={next}
              size="sm"
              variant={next === "nedostavil_sa" ? "ghost" : "default"}
              disabled={pending}
              onClick={() =>
                call(
                  `Stav: ${STATUS_STYLE[next].label}.`,
                  () => setStatus({ id: order.id, next }),
                )
              }
            >
              {STATUS_LABEL_BUTTON[next]}
            </Button>
          ))}
        </div>
      </section>

      <WorkersSection
        workers={detail.workers}
        assignable={assignableWorkers}
        pending={pending}
        onAdd={(workerId) =>
          call("Zamestnanec pridaný.", () =>
            addOrderWorker({ id: order.id, workerId }),
          )
        }
        onRemove={(workerId) =>
          call("Zamestnanec odobraný.", () =>
            removeOrderWorker({ id: order.id, workerId }),
          )
        }
      />

      <ServicesSection
        lines={detail.services}
        canEdit={isManager}
        canRemove={order.status === "vytvorena"}
        pending={pending}
        services={services}
        existingServiceIds={new Set(
          activeServices.map((l) => l.service_id),
        )}
        onAdd={(serviceId, quantity) =>
          call("Služba pridaná.", () =>
            addOrderService({ id: order.id, serviceId, quantity }),
          )
        }
        onRemove={(orderServiceId) =>
          call("Služba odstránená.", () =>
            removeOrderService({ orderServiceId }),
          )
        }
        onPaid={(orderServiceId, paid) =>
          call("Platba zmenená.", () =>
            setOrderServicePaid({ orderServiceId, paid }),
          )
        }
        totalCents={totalCents}
      />

      <SmsSection
        sms={sms}
        canResend={isManager}
        pending={pending}
        onResend={(smsId) =>
          call("SMS znovu odoslaná.", () => resendSms({ smsId }))
        }
      />

      {isManager && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <MoveDialog
            box={order.box}
            startDate={dateKey}
            startTime={startHHMM}
            pending={pending}
            onMove={(box, startsAtIso) =>
              call("Termín presunutý.", () =>
                moveOrder({ id: order.id, box, startsAt: startsAtIso }),
              )
            }
          />
          <DeleteDialog
            disabled={order.status === "zaplatena" || pending}
            pending={pending}
            onConfirm={() =>
              call("Objednávka zrušená.", () =>
                deleteOrder({ id: order.id }),
              )
            }
          />
        </section>
      )}
    </div>
  );
}

function NoteSection({
  note,
  canEdit,
  onSave,
}: {
  note: string | null;
  canEdit: boolean;
  onSave: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");

  if (!canEdit) {
    return (
      <section
        data-section="note"
        className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm"
      >
        <div className="text-xs uppercase text-amber-900">Poznámka</div>
        <p className="font-medium">
          {note?.trim() ? note : <span className="text-muted-foreground">—</span>}
        </p>
      </section>
    );
  }
  return (
    <section
      data-section="note"
      className="space-y-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-amber-900">Poznámka</div>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {note ? "Upraviť" : "Pridať"}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border bg-white p-2 text-sm"
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(note ?? "");
                setEditing(false);
              }}
            >
              Zrušiť
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onSave(value.trim() || null);
                setEditing(false);
              }}
            >
              Uložiť
            </Button>
          </div>
        </div>
      ) : (
        <p className="font-medium">
          {note?.trim() ? note : <span className="text-muted-foreground">—</span>}
        </p>
      )}
    </section>
  );
}

function WorkersSection({
  workers,
  assignable,
  pending,
  onAdd,
  onRemove,
}: {
  workers: OrderDetail["workers"];
  assignable: WorkerLite[];
  pending: boolean;
  onAdd: (workerId: string) => void;
  onRemove: (workerId: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  return (
    <section data-section="workers" className="space-y-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">Pracovníci</h2>
      <ul className="space-y-1 text-sm">
        {workers.length === 0 && (
          <li className="text-muted-foreground">Nepridelený žiadny pracovník.</li>
        )}
        {workers.map((w) => (
          <li
            key={w.worker_id}
            data-worker-id={w.worker_id}
            className="flex items-center justify-between rounded border p-2"
          >
            <span>{w.worker.display_name}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onRemove(w.worker_id)}
            >
              Odobrať
            </Button>
          </li>
        ))}
      </ul>
      {assignable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px] space-y-1">
            <Label htmlFor="worker-select">Pridať pracovníka</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="worker-select">
                <SelectValue placeholder="Vyberte…" />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!selected || pending}
            onClick={() => {
              if (selected) {
                onAdd(selected);
                setSelected("");
              }
            }}
          >
            Pridať
          </Button>
        </div>
      )}
    </section>
  );
}

function ServicesSection({
  lines,
  canEdit,
  canRemove,
  pending,
  services,
  existingServiceIds,
  onAdd,
  onRemove,
  onPaid,
  totalCents,
}: {
  lines: OrderDetail["services"];
  canEdit: boolean;
  canRemove: boolean;
  pending: boolean;
  services: ServiceWithPrices[];
  existingServiceIds: Set<string>;
  onAdd: (serviceId: string, quantity?: number) => void;
  onRemove: (id: string) => void;
  onPaid: (id: string, paid: boolean) => void;
  totalCents: number;
}) {
  const [selected, setSelected] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  return (
    <section data-section="services" className="space-y-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">Služby</h2>
      <ul className="space-y-1 text-sm">
        {lines.length === 0 && (
          <li className="text-muted-foreground">Žiadne služby.</li>
        )}
        {lines.map((l) => (
          <li
            key={l.id}
            data-service-line-id={l.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded border p-2 ${
              l.removed_at ? "opacity-50 line-through" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{l.name_snapshot}</div>
              <div className="text-xs text-muted-foreground">
                {l.quantity > 1 ? `${l.quantity}× · ` : ""}
                {l.duration_min_snapshot ?? 0} min ·{" "}
                {formatPriceCents(l.price_cents_snapshot)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && !l.removed_at && (
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={l.paid}
                    disabled={pending}
                    onChange={(e) => onPaid(l.id, e.target.checked)}
                  />
                  Zaplatené
                </label>
              )}
              {!canEdit && (
                <Badge variant={l.paid ? "default" : "secondary"}>
                  {l.paid ? "Zaplatené" : "Nezaplatené"}
                </Badge>
              )}
              {canEdit && !l.removed_at && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || !canRemove}
                  onClick={() => onRemove(l.id)}
                  title={
                    canRemove
                      ? "Odstrániť"
                      : "Vykonanú službu nie je možné odstrániť."
                  }
                >
                  Odstrániť
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-end text-sm">
        Cena spolu: <span className="ml-1 font-medium">{formatPriceCents(totalCents)}</span>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-2">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label htmlFor="add-service">Pridať službu</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="add-service">
                <SelectValue placeholder="Vyberte…" />
              </SelectTrigger>
              <SelectContent>
                {services
                  .filter((s) => !existingServiceIds.has(s.service.id))
                  .map((s) => (
                    <SelectItem key={s.service.id} value={s.service.id}>
                      {s.service.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-qty">Počet</Label>
            <Input
              id="add-qty"
              inputMode="numeric"
              className="w-20"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={!selected || pending}
            onClick={() => {
              if (!selected) return;
              const q = Math.max(1, Number(quantity) || 1);
              onAdd(selected, q);
              setSelected("");
              setQuantity("1");
            }}
          >
            Pridať službu
          </Button>
        </div>
      )}
    </section>
  );
}

function MoveDialog({
  box,
  startDate,
  startTime,
  pending,
  onMove,
}: {
  box: number;
  startDate: string;
  startTime: string;
  pending: boolean;
  onMove: (box: number, isoStart: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(startDate);
  const [time, setTime] = useState(startTime);
  const [b, setB] = useState<number>(box);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          Presunúť termín
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Presunúť termín</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="move-date">Dátum</Label>
            <Input
              id="move-date"
              type="date"
              value={date}
              lang="sk-SK"
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="move-time">Čas</Label>
            <Input
              id="move-time"
              type="time"
              step={900}
              value={time}
              lang="sk-SK"
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="move-box">Box</Label>
            <Select value={String(b)} onValueChange={(v) => setB(Number(v))}>
              <SelectTrigger id="move-box">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Box 1</SelectItem>
                <SelectItem value="2">Box 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Zrušiť</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() => {
              const iso = bratislavaLocalToISO(date, time);
              onMove(b, iso);
              setOpen(false);
            }}
          >
            Presunúť
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
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

function SmsSection({
  sms,
  canResend,
  pending,
  onResend,
}: {
  sms: SmsMessageRow[];
  canResend: boolean;
  pending: boolean;
  onResend: (smsId: string) => void;
}) {
  const STATUS_LABEL: Record<SmsMessageRow["status"], string> = {
    pending: "Odosiela sa",
    sent: "Odoslané",
    delivered: "Doručené",
    failed: "Zlyhalo",
  };
  return (
    <section data-section="sms" className="space-y-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">SMS</h2>
      <ul className="space-y-1 text-sm">
        {sms.length === 0 && (
          <li className="text-muted-foreground">Žiadne SMS pre túto objednávku.</li>
        )}
        {sms.map((m) => (
          <li
            key={m.id}
            data-sms-id={m.id}
            data-sms-status={m.status}
            className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{SMS_TYPE_LABEL[m.type]}</span>
                <Badge
                  variant={
                    m.status === "failed"
                      ? "destructive"
                      : m.status === "delivered" || m.status === "sent"
                        ? "default"
                        : "secondary"
                  }
                >
                  {STATUS_LABEL[m.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString("sk-SK")}
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.body}</div>
              {m.error && (
                <div className="text-xs text-red-600">{m.error}</div>
              )}
            </div>
            {canResend && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onResend(m.id)}
              >
                Poslať znova
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Used by parent to compute the export type
export type { OrderDetail };
