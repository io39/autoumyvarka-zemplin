"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { getAuditLog } from "@/lib/actions/audit";
import {
  ACTION_LABEL,
  ENTITY_LABEL,
  actionLabel,
  entityLabel,
  summarizeDetails,
} from "@/lib/audit/labels";
import { bratislavaDateKey, bratislavaHHMM } from "@/lib/settings/availability";
import type { AuditLogRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ALL = "all"; // Select needs a non-empty value for the "no filter" option.
// Rows per page. Keep in sync with the initial server fetch in app/audit/page.tsx.
const PAGE_SIZE = 20;

const ACTION_OPTIONS = Object.entries(ACTION_LABEL).sort((a, b) =>
  a[1].localeCompare(b[1], "sk"),
);
const ENTITY_OPTIONS = Object.entries(ENTITY_LABEL).sort((a, b) =>
  a[1].localeCompare(b[1], "sk"),
);

interface Filters {
  from: string;
  to: string;
  action: string;
  entityType: string;
}

const EMPTY: Filters = { from: "", to: "", action: ALL, entityType: ALL };

export function AuditView({
  initialEntries,
  initialCursor,
  orderId,
}: {
  initialEntries: AuditLogRow[];
  initialCursor: string | null;
  orderId: string | null;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [entries, setEntries] = useState<AuditLogRow[]>(initialEntries);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  // Client-side stack of page-start cursors (spec 18 §2.4): one entry per page
  // visited, `null` for page 1. Push on ▶, pop on ◀; length-1 = current page.
  const [pageStack, setPageStack] = useState<(string | null)[]>([null]);
  const [pending, startTransition] = useTransition();

  const pageIndex = pageStack.length - 1; // 0-based

  function buildArgs(f: Filters, cursor?: string) {
    return {
      from: f.from || undefined,
      to: f.to || undefined,
      actions: f.action !== ALL ? [f.action] : undefined,
      entityType: f.entityType !== ALL ? f.entityType : undefined,
      orderId: orderId ?? undefined,
      cursor,
      limit: PAGE_SIZE,
    };
  }

  function applyFilters(next: Filters) {
    setFilters(next);
    startTransition(async () => {
      const res = await getAuditLog(buildArgs(next));
      setEntries(res.entries);
      setNextCursor(res.nextCursor);
      setPageStack([null]); // any filter change resets to page 1
    });
  }

  // ▶ next page: replace the visible rows (no append) and remember this page's
  // start cursor so ◀ can return to it.
  function nextPage() {
    if (!nextCursor) return;
    const start = nextCursor;
    startTransition(async () => {
      const res = await getAuditLog(buildArgs(filters, start));
      setEntries(res.entries);
      setNextCursor(res.nextCursor);
      setPageStack((s) => [...s, start]);
    });
  }

  // ◀ previous page: re-fetch the prior page from its remembered start cursor.
  function prevPage() {
    if (pageStack.length <= 1) return;
    const target = pageStack[pageStack.length - 2];
    startTransition(async () => {
      const res = await getAuditLog(buildArgs(filters, target ?? undefined));
      setEntries(res.entries);
      setNextCursor(res.nextCursor);
      setPageStack((s) => s.slice(0, -1));
    });
  }

  const prepared = entries.map((e) => {
    const at = new Date(e.created_at);
    return {
      id: e.id,
      action: e.action,
      time: `${bratislavaDateKey(at)} ${bratislavaHHMM(at)}`,
      actor: e.actor_email,
      actionLbl: actionLabel(e.action),
      entityLbl: entityLabel(e.entity_type),
      orderId: e.order_id,
      summary: summarizeDetails(e.action, e.details),
    };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Záznam zmien</h1>

      {orderId && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>
            Filtrované na objednávku{" "}
            <Link href={`/orders/${orderId}`} className="font-mono underline underline-offset-4">
              {orderId.slice(0, 8)}
            </Link>
          </span>
          <Link href="/audit" className="underline underline-offset-4">
            Zrušiť filter
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="from">Od dátumu</Label>
          <Input
            id="from"
            type="date"
            lang="sk-SK"
            value={filters.from}
            onChange={(e) => applyFilters({ ...filters, from: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Do dátumu</Label>
          <Input
            id="to"
            type="date"
            lang="sk-SK"
            value={filters.to}
            onChange={(e) => applyFilters({ ...filters, to: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="action">Akcia</Label>
          <Select
            value={filters.action}
            onValueChange={(v) => applyFilters({ ...filters, action: v })}
          >
            <SelectTrigger id="action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Všetky akcie</SelectItem>
              {ACTION_OPTIONS.map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="entity">Objekt</Label>
          <Select
            value={filters.entityType}
            onValueChange={(v) => applyFilters({ ...filters, entityType: v })}
          >
            <SelectTrigger id="entity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Všetky objekty</SelectItem>
              {ENTITY_OPTIONS.map(([type, label]) => (
                <SelectItem key={type} value={type}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(filters.from || filters.to || filters.action !== ALL || filters.entityType !== ALL) && (
        <Button variant="ghost" size="sm" onClick={() => applyFilters(EMPTY)}>
          Vymazať filtre
        </Button>
      )}

      {/* Desktop: table (≥sm). The e2e selectors scope to this data-section. */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block" data-section="audit">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Čas</TableHead>
              <TableHead>Kto</TableHead>
              <TableHead>Akcia</TableHead>
              <TableHead>Objekt</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prepared.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Žiadne záznamy pre zvolený filter
                </TableCell>
              </TableRow>
            ) : (
              prepared.map((e) => (
                <TableRow key={e.id} data-action={e.action} data-id={e.id}>
                  <TableCell className="whitespace-nowrap text-sm">{e.time}</TableCell>
                  <TableCell className="text-sm">{e.actor}</TableCell>
                  <TableCell className="text-sm">{e.actionLbl}</TableCell>
                  <TableCell className="text-sm">
                    {e.orderId ? (
                      <Link href={`/orders/${e.orderId}`} className="underline underline-offset-4">
                        {e.entityLbl}
                      </Link>
                    ) : (
                      e.entityLbl
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.summary}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (<sm) so rows stay readable at 360px (spec §2.1). */}
      <ul className="space-y-2 sm:hidden">
        {prepared.length === 0 ? (
          <li className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
            Žiadne záznamy pre zvolený filter
          </li>
        ) : (
          prepared.map((e) => (
            <li key={e.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{e.actionLbl}</span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">{e.time}</span>
              </div>
              <div className="text-muted-foreground">{e.actor}</div>
              <div>
                {e.orderId ? (
                  <Link href={`/orders/${e.orderId}`} className="underline underline-offset-4">
                    {e.entityLbl}
                  </Link>
                ) : (
                  e.entityLbl
                )}
              </div>
              {e.summary && <div className="text-muted-foreground">{e.summary}</div>}
            </li>
          ))
        )}
      </ul>

      {(pageIndex > 0 || nextCursor) && (
        <div className="flex items-center justify-center gap-3" data-section="audit-pager">
          <Button
            variant="outline"
            size="sm"
            onClick={prevPage}
            disabled={pending || pageIndex === 0}
          >
            ← Predošlé
          </Button>
          <span className="text-sm text-muted-foreground">Strana {pageIndex + 1}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={nextPage}
            disabled={pending || !nextCursor}
          >
            Ďalšie →
          </Button>
        </div>
      )}
    </div>
  );
}
