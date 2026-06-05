"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type { ClientRow, CarRow } from "@/lib/supabase/types";
import {
  buildCarHistories,
  type CarHistory,
  type HistoryOrderInput,
} from "@/lib/clients/history";
import { type ActionResult, toActionError } from "./result";
import {
  findClientByPhoneSchema,
  searchClientsSchema,
  listClientsSchema,
  createClientSchema,
  updateClientSchema,
  deleteClientSchema,
} from "@/lib/validation/clients";

const PHONE_TAKEN_MESSAGE = "Klient s týmto telefónnym číslom už existuje.";

export interface ClientSuggestion {
  clientId: string;
  name: string | null;
  phone: string;
  matchedSpz: string | null;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** Exact lookup by (normalized) phone — the booking-flow entry point. Both roles. */
export async function findClientByPhone(input: unknown): Promise<ClientRow | null> {
  const { phone } = findClientByPhoneSchema.parse(input);
  await getCurrentStaff(); // authenticated; both roles may read

  const { data, error } = await getServiceClient()
    .from("clients")
    .select("*")
    .eq("phone", phone)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export interface ClientWithCars {
  client: ClientRow;
  cars: CarRow[];
  /** Cars linked to more than one client → show the "zdieľané auto" badge. */
  sharedCarIds: string[];
}

/** Client detail: the client row + its linked cars (ŠPZ, model, category). Both roles. */
export async function getClientWithCars(clientId: string): Promise<ClientWithCars | null> {
  await getCurrentStaff();
  const db = getServiceClient();

  const { data: client, error } = await db
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!client) return null;

  const { data: links, error: linksError } = await db
    .from("client_cars")
    .select("cars(*)")
    .eq("client_id", clientId);
  if (linksError) throw linksError;

  const cars = (links ?? [])
    .map((l) => l.cars as CarRow | null)
    .filter((c): c is CarRow => c !== null);

  // A car linked to >1 client is "shared" (read-only/additive; same definition
  // as the history view — PRD §13#1). One extra query over this client's cars.
  const carIds = cars.map((c) => c.id);
  let sharedCarIds: string[] = [];
  if (carIds.length > 0) {
    const { data: shareLinks, error: shareError } = await db
      .from("client_cars")
      .select("car_id, client_id")
      .in("car_id", carIds);
    if (shareError) throw shareError;
    const owners = new Map<string, Set<string>>();
    for (const l of shareLinks ?? []) {
      const set = owners.get(l.car_id) ?? new Set<string>();
      set.add(l.client_id);
      owners.set(l.car_id, set);
    }
    sharedCarIds = carIds.filter((id) => (owners.get(id)?.size ?? 0) > 1);
  }

  return { client, cars, sharedCarIds };
}

export interface ClientWithHistory {
  client: ClientRow;
  cars: CarHistory[];
}

/**
 * Client detail + per-car service history (spec 08). Both roles.
 *
 * Shared-car aggregation (PRD §13#1): orders are loaded by `car_id` with **no**
 * `client_id` filter, so a car linked to several clients shows every order on
 * it. Soft-deleted (cancelled) orders are fetched too and filtered in
 * `buildCarHistories` (keeps that the honest gate); no-shows are kept.
 */
export async function getClientWithHistory(
  clientId: string,
): Promise<ClientWithHistory | null> {
  // zod at the boundary (CLAUDE.md); a non-uuid id is treated as not-found so
  // the page renders its 404 view rather than throwing.
  const parsed = z.string().uuid().safeParse(clientId);
  if (!parsed.success) return null;
  clientId = parsed.data;

  await getCurrentStaff();
  const db = getServiceClient();

  const { data: client, error } = await db
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!client) return null;

  const { data: links, error: linksError } = await db
    .from("client_cars")
    .select("cars(*)")
    .eq("client_id", clientId);
  if (linksError) throw linksError;

  const cars = (links ?? [])
    .map((l) => l.cars as CarRow | null)
    .filter((c): c is CarRow => c !== null);
  const carIds = cars.map((c) => c.id);

  if (carIds.length === 0) {
    return { client, cars: [] };
  }

  // A car shared with other clients (linked to >1 client) gets the
  // "zdieľané auto" hint; count distinct clients per car_id.
  const { data: allLinks, error: allLinksError } = await db
    .from("client_cars")
    .select("car_id, client_id")
    .in("car_id", carIds);
  if (allLinksError) throw allLinksError;

  const clientsPerCar = new Map<string, Set<string>>();
  for (const l of allLinks ?? []) {
    const set = clientsPerCar.get(l.car_id) ?? new Set<string>();
    set.add(l.client_id);
    clientsPerCar.set(l.car_id, set);
  }
  const sharedCarIds = new Set(
    [...clientsPerCar.entries()]
      .filter(([, set]) => set.size > 1)
      .map(([id]) => id),
  );

  // Every order on these cars, regardless of which linked client booked it.
  // deleted_at is NOT filtered here — buildCarHistories owns that.
  const { data: orders, error: ordersError } = await db
    .from("orders")
    .select(
      "id, car_id, starts_at, ends_at, status, note, box, deleted_at, services:order_services(name_snapshot, quantity, price_cents_snapshot, removed_at), workers:order_staff(worker:worker_id(display_name))",
    )
    .in("car_id", carIds);
  if (ordersError) throw ordersError;

  // After spec 11, worker_id -> workers and assigned_by -> staff point to
  // different tables, so PostgREST resolves the `worker:worker_id` embed cleanly.
  const histories = buildCarHistories(cars, (orders ?? []) as HistoryOrderInput[], sharedCarIds);
  return { client, cars: histories };
}

/** Unified fuzzy search (phone / name / ŠPZ) via the search_clients RPC. Both roles. */
export async function searchClients(input: unknown): Promise<ClientSuggestion[]> {
  const { query, limit } = searchClientsSchema.parse(input);
  await getCurrentStaff();

  if (query.trim().length < 2) return [];

  const { data, error } = await getServiceClient().rpc("search_clients", {
    q: query,
    lim: limit ?? 10,
  });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    clientId: r.client_id,
    name: r.name,
    phone: r.phone,
    matchedSpz: r.matched_spz,
  }));
}

export interface ClientsPage {
  clients: ClientSuggestion[];
  total: number;
}

/**
 * Alphabetical, paginated list of all clients (name then phone; nameless last).
 * Drives the browse list under the search bar when no query is typed. Both roles.
 * Offset pagination — Phase-1 client volume is small; the search RPC stays the
 * path for fuzzy lookups.
 */
export async function listClients(input: unknown): Promise<ClientsPage> {
  const { page, pageSize } = listClientsSchema.parse(input);
  await getCurrentStaff();

  const from = page * pageSize;
  const { data, count, error } = await getServiceClient()
    .from("clients")
    .select("id, name, phone", { count: "exact" })
    .is("deleted_at", null)
    .order("name", { ascending: true, nullsFirst: false })
    .order("phone", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;

  return {
    clients: (data ?? []).map((r) => ({
      clientId: r.id,
      name: r.name,
      phone: r.phone,
      matchedSpz: null,
    })),
    total: count ?? 0,
  };
}

export type CreateClientResult =
  | { ok: true; id: string }
  | { ok: false; message: string; existingClientId?: string };

/** Register a new client. Both roles (workers create clients while booking). */
export async function createClient(input: unknown): Promise<CreateClientResult> {
  try {
    const data = createClientSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    const { data: row, error } = await db
      .from("clients")
      .insert({ phone: data.phone, name: data.name ?? null })
      .select("id")
      .single();

    if (isUniqueViolation(error)) {
      const { data: existing } = await db
        .from("clients")
        .select("id")
        .eq("phone", data.phone)
        .maybeSingle();
      return { ok: false, message: PHONE_TAKEN_MESSAGE, existingClientId: existing?.id };
    }
    if (error) throw error;

    await writeAudit(actor, "client.create", "client", row.id, {
      phone: data.phone,
      name: data.name ?? null,
    });

    revalidatePath("/clients");
    return { ok: true, id: row.id };
  } catch (error) {
    return toActionError(error);
  }
}

export type UpdateClientResult = ActionResult & { existingClientId?: string };

/** Edit client data, incl. the phone key (manager only — people switch numbers). */
export async function updateClient(input: unknown): Promise<UpdateClientResult> {
  try {
    const data = updateClientSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeError } = await db
      .from("clients")
      .select("phone, name")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: "Klient sa nenašiel." };

    const nextName = data.name ?? null;
    const phoneChanged = data.phone !== undefined && data.phone !== before.phone;
    const dataChanged = nextName !== before.name;

    const { error } = await db
      .from("clients")
      .update({ phone: data.phone ?? before.phone, name: nextName })
      .eq("id", data.id);

    if (isUniqueViolation(error)) {
      // phoneChanged guarantees data.phone is defined here (only a new phone collides).
      const { data: existing } = await db
        .from("clients")
        .select("id")
        .eq("phone", data.phone!)
        .maybeSingle();
      return { ok: false, message: PHONE_TAKEN_MESSAGE, existingClientId: existing?.id };
    }
    if (error) throw error;

    // A phone (key) change is specifically audited as client.phone_change; a
    // plain data edit as client.update. Emit each only when it actually changed.
    if (phoneChanged) {
      await writeAudit(actor, "client.phone_change", "client", data.id, {
        from: before.phone,
        to: data.phone!,
      });
    }
    if (dataChanged) {
      await writeAudit(actor, "client.update", "client", data.id, {
        from: { name: before.name },
        to: { name: nextName },
      });
    }

    revalidatePath(`/clients/${data.id}`);
    revalidatePath("/clients");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Soft-delete a client (manager only). Sets `deleted_at` so the client drops out
 * of search/browse/lookup while order/car history is preserved (CLAUDE.md
 * soft-delete rule). Idempotent: a second call on an already-deleted client is a
 * no-op success.
 */
export async function deleteClient(input: unknown): Promise<ActionResult> {
  try {
    const { id } = deleteClientSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeError } = await db
      .from("clients")
      .select("id, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: "Klient sa nenašiel." };
    if (before.deleted_at) return { ok: true }; // already deleted

    const { error } = await db
      .from("clients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;

    await writeAudit(actor, "client.delete", "client", id, {});

    revalidatePath("/clients");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
