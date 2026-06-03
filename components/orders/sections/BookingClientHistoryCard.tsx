import Link from "next/link";
import type { RecentVisit } from "@/lib/actions/orders";
import { bratislavaDateDisplay } from "@/lib/settings/availability";
import { STATE_COLOR, STATE_LABEL } from "@/types";
import { Badge } from "@/components/ui/badge";

/**
 * História klienta — the client's last few other visits (newest-first), each
 * row links to that order; a "Celá história →" link opens the full client page.
 */
export function BookingClientHistoryCard({
  clientId,
  visits,
}: {
  clientId: string;
  visits: RecentVisit[];
}) {
  return (
    <section className="rounded-lg border p-4 text-sm" data-section="client-history">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        História klienta
      </div>

      {visits.length === 0 ? (
        <p className="text-muted-foreground">Žiadne predošlé návštevy.</p>
      ) : (
        <ul className="space-y-1">
          {visits.map((v) => {
            const style = STATE_COLOR[v.status];
            return (
              <li key={v.orderId}>
                <Link
                  href={`/orders/${v.orderId}`}
                  data-order-id={v.orderId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{bratislavaDateDisplay(new Date(v.startsAt))}</span>
                    {v.carLabel && <span className="text-muted-foreground"> · {v.carLabel}</span>}
                    {v.serviceNames.length > 0 && (
                      <span className="text-muted-foreground"> · {v.serviceNames.join(", ")}</span>
                    )}
                  </span>
                  <Badge className={`border ${style.bg} ${style.border} ${style.text}`}>
                    {STATE_LABEL[v.status]}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href={`/clients?id=${clientId}`}
        className="mt-2 inline-block font-medium text-primary hover:underline"
      >
        Celá história →
      </Link>
    </section>
  );
}
