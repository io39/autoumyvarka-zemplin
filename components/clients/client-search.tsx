"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { searchClients, createClient, type ClientSuggestion } from "@/lib/actions/clients";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Sequence guard: ignore out-of-order (stale) responses.
  const seq = useRef(0);

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
        if (id === seq.current) setResults(r);
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
        <h1 className="text-xl font-semibold">Klienti</h1>
        <Button onClick={() => setCreateOpen(true)}>Nový klient</Button>
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
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-accent"
                  onClick={() => router.push(`/clients/${r.clientId}`)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name ?? "(bez mena)"}</span>
                    <span className="block text-sm text-muted-foreground">{r.phone}</span>
                  </span>
                  {r.matchedSpz && <Badge variant="secondary">{r.matchedSpz}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateClientDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => router.push(`/clients/${id}`)}
        onDuplicate={(id) => id && router.push(`/clients/${id}`)}
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
            <DialogTitle>Nový klient</DialogTitle>
            <DialogDescription>Telefónne číslo je povinné; meno a poznámka voliteľné.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefón</Label>
              <Input id="phone" name="phone" type="tel" required placeholder="0905 123 456" />
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
