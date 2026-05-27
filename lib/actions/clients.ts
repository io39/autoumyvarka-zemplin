"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type { ClientRow, CarRow } from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  findClientByPhoneSchema,
  searchClientsSchema,
  createClientSchema,
  updateClientSchema,
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
    .maybeSingle();

  if (error) throw error;
  return data;
}

export interface ClientWithCars {
  client: ClientRow;
  cars: CarRow[];
}

/** Client detail: the client row + its linked cars (ŠPZ, model, category). Both roles. */
export async function getClientWithCars(clientId: string): Promise<ClientWithCars | null> {
  await getCurrentStaff();
  const db = getServiceClient();

  const { data: client, error } = await db
    .from("clients")
    .select("*")
    .eq("id", clientId)
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

  return { client, cars };
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
      .insert({ phone: data.phone, name: data.name ?? null, note: data.note ?? null })
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
      .select("phone, name, note")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: "Klient sa nenašiel." };

    const nextName = data.name ?? null;
    const nextNote = data.note ?? null;
    const phoneChanged = data.phone !== undefined && data.phone !== before.phone;
    const dataChanged = nextName !== before.name || nextNote !== before.note;

    const { error } = await db
      .from("clients")
      .update({ phone: data.phone ?? before.phone, name: nextName, note: nextNote })
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
        from: { name: before.name, note: before.note },
        to: { name: nextName, note: nextNote },
      });
    }

    revalidatePath(`/clients/${data.id}`);
    revalidatePath("/clients");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
