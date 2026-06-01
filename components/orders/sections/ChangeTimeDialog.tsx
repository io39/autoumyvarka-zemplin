"use client";

import { useState } from "react";
import { bratislavaLocalToISO } from "@/lib/time/bratislava";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * "Zmeniť čas" — manager-only date/time/box move (UI-STRUCTURE §7 #3 left).
 * Interim working dialog (the existing MoveDialog); spec 16 repoints this to the
 * wizard edit flow. Internals (#move-date/#move-time/#move-box, "Presunúť"
 * confirm) unchanged.
 */
export function ChangeTimeDialog({
  box,
  startDate,
  startTime,
  pending,
  onMove,
}: {
  box: number;
  startDate: string;
  startTime: string;
  pending: boolean;
  onMove: (box: number, isoStart: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(startDate);
  const [time, setTime] = useState(startTime);
  const [b, setB] = useState<number>(box);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          Zmeniť čas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zmeniť čas</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="move-date">Dátum</Label>
            <Input
              id="move-date"
              type="date"
              value={date}
              lang="sk-SK"
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="move-time">Čas</Label>
            <Input
              id="move-time"
              type="time"
              step={900}
              value={time}
              lang="sk-SK"
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="move-box">Box</Label>
            <Select value={String(b)} onValueChange={(v) => setB(Number(v))}>
              <SelectTrigger id="move-box">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Box 1</SelectItem>
                <SelectItem value="2">Box 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Zrušiť</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() => {
              const iso = bratislavaLocalToISO(date, time);
              onMove(b, iso);
              setOpen(false);
            }}
          >
            Uložiť
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
