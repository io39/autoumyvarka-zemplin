import type { SmsMessageRow } from "@/lib/supabase/types";
import { SMS_TYPE_LABEL } from "@/lib/sms/render";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<SmsMessageRow["status"], string> = {
  pending: "Odosiela sa",
  sent: "Odoslané",
  delivered: "Doručené",
  failed: "Zlyhalo",
};

/**
 * Read-only SMS delivery log (UI-STRUCTURE §7 #9). Failed sends stay visible
 * with their error; "Poslať znova" is manager-only (`canResend`).
 *
 * When the operator suppressed the "ready" SMS (spec 06 §2.2) no row exists, so
 * `showUnsentReady` renders a synthetic **Neodoslaná** entry with an **Odoslať**
 * button (both roles) — `onSendReady` dispatches it after all (unchecked by
 * mistake). Once sent, a real row replaces the synthetic entry.
 */
export function SmsStatusCard({
  sms,
  canResend,
  pending,
  onResend,
  showUnsentReady,
  onSendReady,
}: {
  sms: SmsMessageRow[];
  canResend: boolean;
  pending: boolean;
  onResend: (smsId: string) => void;
  showUnsentReady: boolean;
  onSendReady: () => void;
}) {
  return (
    <section data-section="sms" className="space-y-2 rounded-lg border p-4">
      <h2 className="text-sm font-medium">SMS</h2>
      <ul className="space-y-1 text-sm">
        {sms.length === 0 && !showUnsentReady && (
          <li className="text-muted-foreground">Žiadne SMS pre túto objednávku.</li>
        )}
        {showUnsentReady && (
          <li
            data-sms-id="ready-unsent"
            data-sms-status="unsent"
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed p-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{SMS_TYPE_LABEL.ready}</span>
                <Badge variant="secondary">Neodoslaná</Badge>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                SMS o dokončení nebola odoslaná.
              </div>
            </div>
            <Button size="sm" variant="outline" disabled={pending} onClick={onSendReady}>
              Odoslať
            </Button>
          </li>
        )}
        {sms.map((m) => (
          <li
            key={m.id}
            data-sms-id={m.id}
            data-sms-status={m.status}
            className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{SMS_TYPE_LABEL[m.type]}</span>
                <Badge
                  variant={
                    m.status === "failed"
                      ? "destructive"
                      : m.status === "delivered" || m.status === "sent"
                        ? "default"
                        : "secondary"
                  }
                >
                  {STATUS_LABEL[m.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString("sk-SK")}
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.body}</div>
              {m.error && <div className="text-xs text-red-600">{m.error}</div>}
            </div>
            {canResend && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => onResend(m.id)}>
                Poslať znova
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
