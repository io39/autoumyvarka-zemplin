import type { ClientRow } from "@/lib/supabase/types";

/** Klient block — name + phone (UI-STRUCTURE §7 #4). Client history lives in its
 *  own "História klienta" box below. */
export function BookingClientCard({ client }: { client: ClientRow }) {
  return (
    <section className="rounded-lg border p-4 text-sm" data-section="client">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Klient</div>
      <div className="break-words font-medium">{client.name ?? "—"}</div>
      <div className="break-words text-muted-foreground">{client.phone}</div>
    </section>
  );
}
