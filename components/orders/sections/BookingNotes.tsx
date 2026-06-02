"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PROMINENT =
  "rounded-lg border border-l-4 border-l-primary bg-muted/50 p-4 text-sm";

/**
 * The order note (UI-STRUCTURE §7 #8, PRD §7). Stays prominent — a thick accent
 * left-bar instead of the old amber, which would now clash with the hotová=orange
 * status color (spec 13). Workers see it read-only; managers can edit.
 */
export function BookingNotes({
  note,
  canEdit,
  onSave,
}: {
  note: string | null;
  canEdit: boolean;
  onSave: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");

  // The Sheet reuses this component across orders without remounting; resync the
  // editable buffer (and exit edit mode) when the underlying note changes.
  const [syncedNote, setSyncedNote] = useState(note);
  if (note !== syncedNote) {
    setSyncedNote(note);
    setValue(note ?? "");
    setEditing(false);
  }

  if (!canEdit) {
    return (
      <section data-section="note" className={PROMINENT}>
        <div className="text-xs uppercase text-muted-foreground">Poznámka</div>
        <p className="whitespace-pre-wrap break-words font-medium">
          {note?.trim() ? note : <span className="text-muted-foreground">—</span>}
        </p>
      </section>
    );
  }

  return (
    <section data-section="note" className={cn("space-y-2", PROMINENT)}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-muted-foreground">Poznámka</div>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {note ? "Upraviť" : "Pridať"}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border bg-background p-2 text-sm"
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(note ?? "");
                setEditing(false);
              }}
            >
              Zrušiť
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onSave(value.trim() || null);
                setEditing(false);
              }}
            >
              Uložiť
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words font-medium">
          {note?.trim() ? note : <span className="text-muted-foreground">—</span>}
        </p>
      )}
    </section>
  );
}
