import Link from "next/link";
import type { ClientRow } from "@/lib/supabase/types";

/** Klient block + link to the client's history (UI-STRUCTURE §7 #4). */
export function BookingClientCard({ client }: { client: ClientRow }) {
  return (
    <section className="rounded-lg border p-3 text-sm" data-section="client">
      <div className="text-xs uppercase text-muted-foreground">Klient</div>
      <div className="font-medium">{client.name ?? "—"}</div>
      <div className="text-muted-foreground">{client.phone}</div>
      <Link
        href={`/clients/${client.id}`}
        className="text-xs underline underline-offset-4"
      >
        História klienta →
      </Link>
    </section>
  );
}
