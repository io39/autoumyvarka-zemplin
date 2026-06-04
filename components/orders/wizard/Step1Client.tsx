"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  searchClients,
  createClient,
  type ClientSuggestion,
} from "@/lib/actions/clients";
import { normalizePhone } from "@/lib/clients/phone";
import type { ClientRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Step 1 — Klient (UI-STRUCTURE §8). Fuzzy search (phone/name, reusing the
 * spec-02 `searchClients`) to pick an existing client. Telefón is the key
 * (rule #1): when the typed query is a complete phone number that matches no
 * existing client, an inline "new client" affordance (warning + name + add
 * button) appears — there is no separate add-customer button/dialog.
 */
export function Step1Client({
  selectedClient,
  locked,
  onSelect,
}: {
  selectedClient: ClientRow | null;
  /** Edit mode: the client can't change — show it read-only. */
  locked?: boolean;
  onSelect: (clientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSuggestion[]>([]);
  // The query `results` were fetched for. Comparing it to the live query tells us
  // the results are current — so the "not registered" affordance doesn't flash
  // mid-typing before the debounced search lands (derived, no in-effect setState).
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [, startSearch] = useTransition();

  const [name, setName] = useState("");
  const [pending, startCreate] = useTransition();

  // The current query as an E.164 phone, or null if it isn't a complete number.
  const normalizedPhone = useMemo(() => normalizePhone(query), [query]);

  useEffect(() => {
    if (locked) return;
    const q = query.trim();
    const t = setTimeout(() => {
      if (q.length < 2) {
        setResults([]);
        setResultsFor(q);
        return;
      }
      startSearch(async () => {
        setResults(await searchClients({ query: q }));
        setResultsFor(q);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query, locked]);

  // Show the new-client affordance only once a completed search for the current
  // query confirms the typed phone number matches no existing client.
  const searched = resultsFor === query.trim();
  const phoneMatch = normalizedPhone
    ? results.some((r) => r.phone === normalizedPhone)
    : false;
  const showNewClient = !locked && searched && !!normalizedPhone && !phoneMatch;

  function createNew() {
    if (!normalizedPhone) return;
    startCreate(async () => {
      const r = await createClient({ phone: query, name: name.trim() || undefined });
      if (r.ok) {
        toast.success("Klient pridaný.");
        onSelect(r.id);
      } else if (r.existingClientId) {
        // Raced with an existing record (phone is unique) — select it instead.
        toast.success("Klient s týmto číslom už existuje — vybraný.");
        onSelect(r.existingClientId);
      } else {
        toast.error(r.message);
      }
    });
  }

  if (locked) {
    return (
      <section className="space-y-3" data-step="client">
        {selectedClient && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm" data-selected-client>
            <div className="text-xs uppercase text-muted-foreground">Klient (uzamknutý)</div>
            <div className="font-medium">{selectedClient.name ?? "—"}</div>
            <div className="text-muted-foreground">{selectedClient.phone}</div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3" data-step="client">
      <div className="space-y-1">
        <Label htmlFor="client-search">Hľadať klienta (telefón / meno)</Label>
        <Input
          id="client-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="napr. 0905… alebo meno"
          autoComplete="off"
        />
      </div>

      {results.length > 0 && (
        <ul className="divide-y rounded-md border">
          {results.map((r) => (
            <li key={r.clientId}>
              <button
                type="button"
                data-client-id={r.clientId}
                onClick={() => onSelect(r.clientId)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{r.name ?? "—"}</span>
                <span className="text-muted-foreground">{r.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showNewClient && (
        <div className="space-y-2" data-new-client>
          <p
            data-no-match
            className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          >
            Zákazník s týmto číslom ešte nie je registrovaný.
          </p>
          <div className="space-y-1">
            <Label htmlFor="new-client-name">Meno nového zákazníka (voliteľné)</Label>
            <Input
              id="new-client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meno a priezvisko"
              autoComplete="off"
            />
          </div>
          <Button type="button" onClick={createNew} disabled={pending}>
            {pending ? "Pridávam…" : "Pridať nového zákazníka"}
          </Button>
        </div>
      )}

      {selectedClient && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm" data-selected-client>
          <div className="text-xs uppercase text-muted-foreground">Vybraný klient</div>
          <div className="font-medium">{selectedClient.name ?? "—"}</div>
          <div className="text-muted-foreground">{selectedClient.phone}</div>
        </div>
      )}
    </section>
  );
}
