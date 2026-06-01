"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addOrderService,
  createOrder,
  moveOrder,
  removeOrderService,
} from "@/lib/actions/orders";
import { getClientWithCars } from "@/lib/actions/clients";
import type { ServiceWithPrices } from "@/lib/actions/services";
import type { CarRow, ClientRow, PricingCategory } from "@/lib/supabase/types";
import {
  resolveSelectionLines,
  totalDurationMin,
  type Selection,
} from "@/lib/orders/booking";
import { bratislavaLocalToISO } from "@/lib/time/bratislava";
import { BookingStepper } from "./BookingStepper";
import { WizardActions } from "./WizardActions";
import { Step1Client } from "./Step1Client";
import { Step2Car } from "./Step2Car";
import { Step3Services } from "./Step3Services";
import { Step4TimeSlot } from "./Step4TimeSlot";
import type { PickedSlot, WizardMode } from "./types";

type SlotView = "day" | "3day";

export interface EditContext {
  orderId: string;
  originalLines: Array<{ orderServiceId: string; serviceId: string; quantity: number }>;
  currentSlot: PickedSlot;
}

export interface BookingWizardProps {
  mode: WizardMode;
  services: ServiceWithPrices[];
  initial: {
    step: number;
    client: ClientRow | null;
    cars: CarRow[];
    carId: string | null;
    selections: Selection[];
    date: string;
    picked: PickedSlot | null;
  };
  edit?: EditContext;
}

/**
 * Nová rezervácia / Zmeniť čas wizard (UI-STRUCTURE §8, spec 16). Steps Klient →
 * Auto → Služby → Termín for all roles. In edit mode (Zmeniť čas) client/car are
 * locked, it opens on step 3, and finishing applies the diff against the
 * existing order (service add/remove + `moveOrder`) instead of creating one.
 */
export function BookingWizard({ mode, services, initial, edit }: BookingWizardProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [step, setStep] = useState(initial.step);
  const [maxReached, setMaxReached] = useState(initial.step);
  const [client, setClient] = useState<ClientRow | null>(initial.client);
  const [cars, setCars] = useState<CarRow[]>(initial.cars);
  const [carId, setCarId] = useState<string | null>(initial.carId);
  const [selections, setSelections] = useState<Selection[]>(initial.selections);
  const [overrideMin, setOverrideMin] = useState("");
  const [view, setView] = useState<SlotView>("day");
  const [date, setDate] = useState(initial.date);
  const [picked, setPicked] = useState<PickedSlot | null>(initial.picked);

  const isEdit = mode === "edit";
  const category: PricingCategory | null =
    cars.find((c) => c.id === carId)?.pricing_category ?? null;
  const durationMin = useMemo(
    () => totalDurationMin(resolveSelectionLines(selections, services, category), Number(overrideMin)),
    [selections, services, category, overrideMin],
  );

  function goTo(next: number) {
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
  }

  function selectClient(id: string) {
    if (isEdit) return; // client is locked in edit mode
    start(async () => {
      const data = await getClientWithCars(id);
      if (!data) {
        toast.error("Klienta sa nepodarilo načítať.");
        return;
      }
      setClient(data.client);
      setCars(data.cars);
      setCarId(null);
      goTo(1);
    });
  }

  function onCarAdded(newCarId: string) {
    start(async () => {
      if (!client) return;
      const data = await getClientWithCars(client.id);
      if (data) setCars(data.cars);
      setCarId(newCarId);
    });
  }

  // In edit mode the slot length depends on the services; if they change, the
  // pre-selected (current) slot may no longer fit, so force a fresh pick.
  function invalidatePickIfEdit() {
    if (isEdit) setPicked(null);
  }
  function toggleService(serviceId: string) {
    setSelections((prev) =>
      prev.some((s) => s.serviceId === serviceId)
        ? prev.filter((s) => s.serviceId !== serviceId)
        : [...prev, { serviceId, quantity: 1 }],
    );
    invalidatePickIfEdit();
  }
  function setQty(serviceId: string, qty: number) {
    setSelections((prev) =>
      prev.map((s) => (s.serviceId === serviceId ? { ...s, quantity: Math.max(1, qty) } : s)),
    );
    invalidatePickIfEdit();
  }

  const stepValid = [
    client !== null,
    carId !== null,
    selections.length > 0 && durationMin > 0,
    picked !== null,
  ];

  function submit() {
    if (!picked) return;
    const startsAt = bratislavaLocalToISO(picked.dateKey, picked.localStart);
    const override = Number(overrideMin);
    const overrideArg = Number.isFinite(override) && override > 0 ? override : undefined;

    if (isEdit && edit) {
      // The diff is applied via several non-transactional actions; if one fails
      // mid-way some changes are already committed. Re-sync `edit.originalLines`
      // from the server (router.refresh re-runs the edit page) so a retry diffs
      // against the actual state instead of re-sending already-applied removes.
      const fail = (message: string) => {
        toast.error(message);
        router.refresh();
      };
      start(async () => {
        // 1) Service diff (add/remove; a quantity change = remove + re-add).
        for (const o of edit.originalLines) {
          const c = selections.find((s) => s.serviceId === o.serviceId);
          if (!c || c.quantity !== o.quantity) {
            const r = await removeOrderService({ orderServiceId: o.orderServiceId });
            if (!r.ok) return fail(r.message ?? "Zmena služby zlyhala.");
          }
        }
        for (const c of selections) {
          const o = edit.originalLines.find((x) => x.serviceId === c.serviceId);
          if (!o || o.quantity !== c.quantity) {
            const r = await addOrderService({
              id: edit.orderId,
              serviceId: c.serviceId,
              quantity: c.quantity,
            });
            if (!r.ok) return fail(r.message ?? "Zmena služby zlyhala.");
          }
        }
        // 2) Move only if the slot actually changed (keeping the time is not a conflict).
        const moved =
          picked.box !== edit.currentSlot.box ||
          picked.dateKey !== edit.currentSlot.dateKey ||
          picked.localStart !== edit.currentSlot.localStart;
        if (moved) {
          const r = await moveOrder({ id: edit.orderId, box: picked.box, startsAt });
          if (!r.ok) return fail(r.message);
        }
        toast.success("Zmeny uložené.");
        router.push(`/orders/${edit.orderId}`);
      });
      return;
    }

    if (!client || !carId) return;
    start(async () => {
      const r = await createOrder({
        clientId: client.id,
        carId,
        box: picked.box,
        startsAt,
        services: selections,
        durationOverrideMin: overrideArg,
      });
      if (r.ok) {
        toast.success("Objednávka vytvorená.");
        router.push(`/?date=${picked.dateKey}`);
      } else {
        toast.error(r.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <BookingStepper current={step} maxReached={maxReached} onStepClick={(i) => setStep(i)} />

      {step === 0 && (
        <Step1Client selectedClient={client} locked={isEdit} onSelect={selectClient} />
      )}
      {step === 1 && client && (
        <Step2Car
          clientId={client.id}
          cars={cars}
          selectedCarId={carId}
          locked={isEdit}
          onSelect={setCarId}
          onCarAdded={onCarAdded}
        />
      )}
      {step === 2 && (
        <Step3Services
          services={services}
          category={category}
          selections={selections}
          overrideMin={overrideMin}
          allowOverride={!isEdit}
          onToggle={toggleService}
          onQty={setQty}
          onOverrideChange={setOverrideMin}
        />
      )}
      {step === 3 && (
        <Step4TimeSlot
          durationMin={durationMin}
          view={view}
          date={date}
          picked={picked}
          currentSlot={edit?.currentSlot ?? null}
          onViewChange={setView}
          onDateChange={setDate}
          onPick={setPicked}
        />
      )}

      <WizardActions
        isFirst={step === 0}
        isLast={step === 3}
        nextDisabled={!stepValid[step]}
        pending={pending}
        finalLabel={isEdit ? "Uložiť zmeny" : "Vytvoriť rezerváciu"}
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        onNext={() => goTo(step + 1)}
        onFinish={submit}
      />
    </div>
  );
}
