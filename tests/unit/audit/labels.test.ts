import { describe, it, expect } from "vitest";
import {
  actionLabel,
  entityLabel,
  summarizeDetails,
  ACTION_LABEL,
} from "@/lib/audit/labels";

describe("actionLabel / entityLabel", () => {
  it("maps known codes to Slovak labels", () => {
    expect(actionLabel("order.status_change")).toBe("Zmena stavu");
    expect(actionLabel("order.delete")).toBe("Zrušenie objednávky");
    expect(entityLabel("order")).toBe("Objednávka");
  });

  it("falls back to the raw code for unknown values", () => {
    expect(actionLabel("something.unknown")).toBe("something.unknown");
    expect(entityLabel("widget")).toBe("widget");
  });
});

describe("summarizeDetails", () => {
  it("renders status changes via the shared status labels", () => {
    expect(
      summarizeDetails("order.status_change", { from: "vytvorena", to: "hotova" }),
    ).toBe("Vytvorená → Hotová");
  });

  it("renders a delete with the previous status", () => {
    expect(summarizeDetails("order.delete", { previous_status: "vytvorena" })).toBe(
      "Predtým: Vytvorená",
    );
  });

  it("renders a move as box-to-box", () => {
    expect(
      summarizeDetails("order.move", {
        from: { box: 1, starts_at: "x" },
        to: { box: 2, starts_at: "y" },
      }),
    ).toBe("Box 1 → Box 2");
  });

  it("distinguishes note edit vs. clear, and paid vs. unpaid", () => {
    expect(summarizeDetails("order.note_edit", { from: null, to: "Pozor" })).toBe(
      "Poznámka upravená",
    );
    expect(summarizeDetails("order.note_edit", { from: "Pozor", to: null })).toBe(
      "Poznámka zmazaná",
    );
    expect(summarizeDetails("order_service.paid", { from: false, to: true })).toBe(
      "Označené ako zaplatené",
    );
    expect(summarizeDetails("order_service.paid", { from: true, to: false })).toBe(
      "Označené ako nezaplatené",
    );
  });

  it("renders assign / unassign distinctly", () => {
    expect(summarizeDetails("order.assign", { worker_id: "x" })).toBe("Pracovník priradený");
    expect(summarizeDetails("order.unassign", { worker_id: "x" })).toBe("Pracovník odobratý");
  });

  it("every event covered by the spec §4.4 coverage check has a non-empty summary", () => {
    const cases: Array<[string, unknown]> = [
      ["order.create", { box: 1, starts_at: "x" }],
      ["order.status_change", { from: "vytvorena", to: "hotova" }],
      ["order.delete", { previous_status: "hotova" }],
      ["order.note_edit", { from: null, to: "Pozor" }],
      ["order.assign", { worker_id: "x" }],
    ];
    for (const [action, details] of cases) {
      expect(summarizeDetails(action, details as never).length).toBeGreaterThan(0);
    }
  });

  it("never throws on null / malformed / unknown details", () => {
    expect(() => summarizeDetails("order.status_change", null)).not.toThrow();
    expect(summarizeDetails("order.move", { from: "oops" })).toBe("Presun termínu");
    expect(summarizeDetails("order.create", null)).toBe("Nová objednávka");
    // Unknown action → empty summary (UI shows the action label alone).
    expect(summarizeDetails("totally.unknown", { a: 1 })).toBe("");
  });

  it("the label map covers every action code written by the app", () => {
    // Guard against an action code being added without a Slovak label.
    const written = [
      "order.create",
      "order.status_change",
      "order.move",
      "order.delete",
      "order.assign",
      "order.unassign",
      "order.note_edit",
      "order_service.add",
      "order_service.remove",
      "order_service.paid",
      "client.create",
      "client.update",
      "client.phone_change",
      "car.create",
      "car.link",
      "car.update",
      "service.create",
      "service.update",
      "service.price_update",
      "service.price_delete",
      "staff.create",
      "staff.update",
      "staff.activate",
      "staff.deactivate",
      "settings.hours_update",
      "settings.override_set",
      "settings.override_remove",
      "sms.template_save",
      "sms.resend",
    ];
    for (const code of written) {
      expect(ACTION_LABEL[code], code).toBeDefined();
    }
  });

  it("labels worker actions", () => {
    expect(ACTION_LABEL["worker.create"]).toBe("Vytvorenie zamestnanca");
    expect(ACTION_LABEL["worker.update"]).toBe("Úprava zamestnanca");
    expect(ACTION_LABEL["worker.activate"]).toBe("Aktivácia zamestnanca");
    expect(ACTION_LABEL["worker.deactivate"]).toBe("Deaktivácia zamestnanca");
  });
});
