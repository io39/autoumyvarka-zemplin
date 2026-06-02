"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { searchClients, createClient, type ClientSuggestion } from "@/lib/actions/clients";
import { normalizePhone } from "@/lib/clients/phone";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ClientSearch() {
  const router = useRouter();
  const selectedId = useSearchParams().get("id");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Sequence guard: ignore out-of-order (stale) responses.
  const seq = useRef(0);

  function select(clientId: string) {
    router.push(`/clients?id=${clientId}`);
  }

  useEffect(() => {
    const q = query.trim();
    const id = ++seq.current;

    if (q.length < 2) {
      // Reset asynchronously (no synchronous setState inside the effect body).
      const t0 = setTimeout(() => {
        if (id === seq.current) {
          setResults([]);
          setLoading(false);
        }
      }, 0);
      return () => clearTimeout(t0);
    }

    const t = setTimeout(async () => {
      if (id !== seq.current) return;
      setLoading(true);
      try {
        const r = await searchClients({ query: q });
        // Results sorted by meno (UI-STRUCTURE §9); nameless rows sort last.
        const sorted = [...r].sort((a, b) =>
          (a.name ?? "￿").localeCompare(b.name ?? "￿", "sk"),
        );
        if (id === seq.current) setResults(sorted);
      } catch {
        if (id === seq.current) setResults([]);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Zákazníci</h1>
        <Button onClick={() => setCreateOpen(true)}>Nový zákazník</Button>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Hľadať podľa telefónu, mena alebo ŠPZ…"
        aria-label="Hľadať klienta"
        autoFocus
      />

      <div className="rounded-lg border">
        {loading && (
          <div className="space-y-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">Žiadny výsledok</p>
        )}

        {!loading && query.trim().length < 2 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Zadajte aspoň 2 znaky.
          </p>
        )}

        {!loading && results.length > 0 && (
          <ul className="divide-y">
            {results.map((r) => (
              <li key={r.clientId}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-accent",
                    r.clientId === selectedId && "bg-accent",
                  )}
                  aria-current={r.clientId === selectedId || undefined}
                  onClick={() => select(r.clientId)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name ?? "(bez mena)"}</span>
                    <span className="block text-sm text-muted-foreground">{r.phone}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateClientDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          // Close the dialog before navigating: we land on the same route
          // (/clients?id=…), so the page's client tree (incl. this Dialog)
          // persists — a still-open modal would aria-hide the new detail.
          setCreateOpen(false);
          select(id);
        }}
        onDuplicate={(id) => {
          if (!id) return;
          setCreateOpen(false);
          select(id);
        }}
      />
    </div>
  );
}

function CreateClientDialog({
  open,
  onClose,
  onCreated,
  onDuplicate,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  onDuplicate: (existingClientId?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  // Non-blocking duplicate-phone hint (same as the wizard's new-client step):
  // the existing client's name if this number is already in the system.
  const [phone, setPhone] = useState("");
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

  function onSubmit(formData: FormData) {
    const phone = String(formData.get("phone") ?? "");
    const name = String(formData.get("name") ?? "");
    const note = String(formData.get("note") ?? "");
    startTransition(async () => {
      const result = await createClient({ phone, name: name || undefined, note: note || undefined });
      if (result.ok) {
        toast.success("Klient vytvorený.");
        onCreated(result.id);
      } else {
        toast.error(result.message);
        if ("existingClientId" in result && result.existingClientId) {
          onDuplicate(result.existingClientId);
        }
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form action={onSubmit}>
          <DialogHeader>
            <DialogTitle>Nový zákazník</DialogTitle>
            <DialogDescription>Telefónne číslo je povinné; meno a poznámka voliteľné.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefón</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                required
                placeholder="0905 123 456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {dupName && (
                <p
                  data-dup-phone
                  className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                >
                  Klient s týmto číslom už existuje — {dupName}. Po vytvorení sa otvorí existujúci.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Meno</Label>
              <Input id="name" name="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Poznámka</Label>
              <Input id="note" name="note" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukladám…" : "Vytvoriť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
