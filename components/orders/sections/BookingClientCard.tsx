import Link from "next/link";
import type { ClientRow } from "@/lib/supabase/types";

/** Klient block + link to the client's history (UI-STRUCTURE §7 #4). */
export function BookingClientCard({ client }: { client: ClientRow }) {
  return (
    <section className="rounded-lg border p-4 text-sm" data-section="client">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Klient</div>
      <div className="break-words font-medium">{client.name ?? "—"}</div>
      <div className="break-words text-muted-foreground">{client.phone}</div>
      <Link
        href={`/clients/${client.id}`}
        className="mt-2 inline-block text-xs underline underline-offset-4"
      >
        História klienta →
      </Link>
    </section>
  );
}
