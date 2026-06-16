import type { Json } from "@/lib/supabase/database.types";
import type { OrderStatus } from "@/lib/supabase/types";
import { STATE_LABEL } from "@/types";
import { formatPriceCents } from "@/lib/services/format";

/**
 * Slovak presentation of audit_log entries (spec 09). Pure — no I/O — so the
 * label map and the per-action `details` summary are unit-testable.
 *
 * Action codes are the exact strings passed to `writeAudit` across specs 01–07
 * (grep `writeAudit(` to keep this in sync). `details` is `Json | null`: it is
 * narrowed defensively here, never trusted to have a given field, and every
 * branch falls back rather than throwing on a missing/unknown shape.
 */

export const ACTION_LABEL: Record<string, string> = {
  // orders (spec 05/06)
  "order.create": "Vytvorenie objednávky",
  "order.status_change": "Zmena stavu",
  "order.move": "Presun objednávky",
  "order.delete": "Zrušenie objednávky",
  "order.assign": "Priradenie pracovníka",
  "order.unassign": "Odobratie pracovníka",
  "order.note_edit": "Úprava poznámky",
  "order.price_override": "Úprava ceny",
  "order_service.add": "Pridanie služby",
  "order_service.remove": "Odobratie služby",
  "order_service.paid": "Zmena úhrady služby",
  // clients & cars (spec 02)
  "client.create": "Vytvorenie klienta",
  "client.update": "Úprava klienta",
  "client.phone_change": "Zmena telefónu",
  "client.delete": "Odstránenie klienta",
  "car.create": "Pridanie auta",
  "car.link": "Prepojenie auta",
  "car.update": "Úprava auta",
  // service catalog (spec 03)
  "service.create": "Vytvorenie služby",
  "service.update": "Úprava služby",
  "service.activate": "Aktivácia služby",
  "service.deactivate": "Deaktivácia služby",
  "service.price_update": "Úprava ceny",
  "service.price_delete": "Zmazanie ceny",
  // staff = login accounts (Účty, spec 01/11) — distinct from workers below
  "staff.create": "Vytvorenie účtu",
  "staff.update": "Úprava účtu",
  "staff.activate": "Aktivácia účtu",
  "staff.deactivate": "Deaktivácia účtu",
  // workers (spec 11)
  "worker.create": "Vytvorenie zamestnanca",
  "worker.update": "Úprava zamestnanca",
  "worker.activate": "Aktivácia zamestnanca",
  "worker.deactivate": "Deaktivácia zamestnanca",
  // settings (spec 04)
  "settings.hours_update": "Úprava otváracích hodín",
  "settings.override_set": "Nastavenie výnimky",
  "settings.override_remove": "Zrušenie výnimky",
  // sms (spec 07)
  "sms.template_save": "Uloženie SMS šablóny",
  "sms.resend": "Opätovné odoslanie SMS",
  "sms.send": "Manuálne odoslanie SMS",
};

export const ENTITY_LABEL: Record<string, string> = {
  order: "Objednávka",
  order_service: "Služba objednávky",
  client: "Klient",
  car: "Auto",
  service: "Služba",
  staff: "Účet",
  worker: "Zamestnanec",
  settings: "Nastavenia",
  sms_template: "SMS šablóna",
  sms_message: "SMS správa",
};

/** Human label for an action code; unknown codes fall back to the raw code. */
export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/** Human label for an entity type; unknown types fall back to the raw type. */
export function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType;
}

function asRecord(details: Json | null): Record<string, unknown> {
  return details !== null && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {};
}

function statusLabel(value: unknown): string {
  if (typeof value !== "string") return "?";
  return STATE_LABEL[value as OrderStatus] ?? value;
}

/**
 * A short Slovak sentence describing what changed, derived from `details`.
 * Returns "" when there is nothing useful to add beyond the action label
 * (the UI then shows the label alone). Never throws on odd `details`.
 */
export function summarizeDetails(action: string, details: Json | null): string {
  const d = asRecord(details);

  switch (action) {
    case "order.status_change":
      return d.sms_suppressed === true
        ? `${statusLabel(d.from)} → ${statusLabel(d.to)} (Zrušenie odosielania SMS)`
        : `${statusLabel(d.from)} → ${statusLabel(d.to)}`;
    case "order.delete":
      return d.previous_status
        ? `Stav pred zrušením: ${statusLabel(d.previous_status)}`
        : "Objednávka zrušená";
    case "order.create":
      return typeof d.box === "number" ? `Box ${d.box}` : "Nová objednávka";
    case "order.move": {
      const from = asRecord(d.from as Json | null);
      const to = asRecord(d.to as Json | null);
      if (typeof from.box === "number" && typeof to.box === "number") {
        return `Box ${from.box} → Box ${to.box}`;
      }
      return "Presun termínu";
    }
    case "order.note_edit":
      return d.to ? "Poznámka upravená" : "Poznámka zmazaná";
    case "order.price_override":
      return d.to == null
        ? "Cena vrátená na súčet služieb"
        : `Cena upravená na ${formatPriceCents(Number(d.to))}`;
    case "order.assign":
    case "order.unassign":
      return action === "order.assign" ? "Pracovník priradený" : "Pracovník odobratý";
    case "order_service.add":
      return "Služba pridaná";
    case "order_service.remove":
      return "Služba odobratá";
    case "order_service.paid":
      return d.to === true ? "Označené ako zaplatené" : "Označené ako nezaplatené";
    case "client.phone_change":
      return d.from && d.to ? `${String(d.from)} → ${String(d.to)}` : "Telefón zmenený";
    case "client.delete": {
      const orders = Number(d.deletedOrders ?? 0);
      const cars = Number(d.deletedCars ?? 0);
      return `Trvalo odstránený · ${orders} obj., ${cars} áut`;
    }
    case "car.link":
      return "Auto prepojené s klientom";
    case "staff.activate":
      return "Účet aktivovaný";
    case "staff.deactivate":
      return "Účet deaktivovaný";
    case "service.activate":
      return "Služba aktivovaná";
    case "service.deactivate":
      return "Služba deaktivovaná";
    case "worker.activate":
      return "Zamestnanec aktivovaný";
    case "worker.deactivate":
      return "Zamestnanec deaktivovaný";
    case "sms.resend":
      return "Nový pokus o odoslanie";
    default:
      return "";
  }
}
