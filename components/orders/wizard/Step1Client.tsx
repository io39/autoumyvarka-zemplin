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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Step 1 — Klient (UI-STRUCTURE §8). Fuzzy search (phone/name, reusing the
 * spec-02 `searchClients`) to pick an existing client. Telefón is the key
 * (rule #1): when the typed query is a complete phone number that matches no
 * existing client, a **"Nový zákazník" row** (styled like a result, showing the
 * number) is appended to the list; clicking it opens the new-client dialog with
 * the phone pre-filled. There is no standalone add-customer button.
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
  // the results are current — so the "Nový zákazník" row doesn't flash mid-typing
  // before the debounced search lands (derived, no in-effect setState).
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [, startSearch] = useTransition();

  // Phone the new-client dialog is open for, or null when closed.
  const [dialogPhone, setDialogPhone] = useState<string | null>(null);

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

  // Offer "Nový zákazník" only once a completed search for the current query
  // confirms the typed phone number matches no existing client.
  const searched = resultsFor === query.trim();
  const phoneMatch = normalizedPhone
    ? results.some((r) => r.phone === normalizedPhone)
    : false;
  const showNewClient = !locked && searched && !!normalizedPhone && !phoneMatch;

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

      {(results.length > 0 || showNewClient) && (
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

          {showNewClient && normalizedPhone && (
            <li>
              <button
                type="button"
                data-new-client
                onClick={() => setDialogPhone(normalizedPhone)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">Nový zákazník</span>
                <span className="text-muted-foreground">{normalizedPhone}</span>
              </button>
            </li>
          )}
        </ul>
      )}

      {dialogPhone !== null && (
        <NewClientDialog
          key={dialogPhone}
          initialPhone={dialogPhone}
          onClose={() => setDialogPhone(null)}
          onCreated={(id) => {
            setDialogPhone(null);
            onSelect(id);
          }}
        />
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

/**
 * New-client popup, opened from the "Nový zákazník" result row with the phone
 * pre-filled. Mounted only while open (keyed on the phone by the parent), so its
 * fields start fresh each time — no reset effects needed. Telefón is the key.
 */
function NewClientDialog({
  initialPhone,
  onClose,
  onCreated,
}: {
  initialPhone: string;
  onClose: () => void;
  onCreated: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  // Non-blocking duplicate-phone hint if the (editable) phone matches a client.
  const [dupName, setDupName] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const norm = normalizePhone(phone);
      if (!norm) {
        setDupName(null);
        return;
      }
      const results = await searchClients({ query: phone });
      const hit = results.find((r) => r.phone === norm);
      setDupName(hit ? (hit.name ?? "bez mena") : null);
    }, 300);
    return () => clearTimeout(t);
  }, [phone]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) onClose();
  }

  function submit() {
    start(async () => {
      const r = await createClient({ phone, name: name.trim() || undefined });
      if (r.ok) {
        toast.success("Klient pridaný.");
        onCreated(r.id);
      } else if (r.existingClientId) {
        toast.success("Klient s týmto číslom už existuje — vybraný.");
        onCreated(r.existingClientId);
      } else {
        toast.error(r.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový zákazník</DialogTitle>
          <DialogDescription>Telefón je povinný a slúži ako kľúč klienta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-client-phone">Telefón</Label>
            <Input
              id="new-client-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0905123456"
            />
            {dupName && (
              <p
                data-dup-phone
                className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              >
                Klient s týmto číslom už existuje — {dupName}. Po pridaní sa vyberie existujúci.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-client-name">Meno (voliteľné)</Label>
            <Input
              id="new-client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending || phone.trim().length < 3}>
            {pending ? "Pridávam…" : "Pridať"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
