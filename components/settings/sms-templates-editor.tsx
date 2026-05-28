"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { saveSmsTemplate } from "@/lib/actions/sms";
import { SMS_TYPE_LABEL, smsSegmentCount, smsOverLimit } from "@/lib/sms/render";
import type { SmsTemplateRow, SmsType } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Props {
  initial: SmsTemplateRow[];
}

export function SmsTemplatesEditor({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initialByType = new Map(initial.map((t) => [t.type, t.body]));
  const types: SmsType[] = ["reminder", "ready"];
  const [bodies, setBodies] = useState<Record<SmsType, string>>(() => ({
    reminder: initialByType.get("reminder") ?? "",
    ready: initialByType.get("ready") ?? "",
  }));

  function save(type: SmsType) {
    const body = bodies[type];
    startTransition(async () => {
      const res = await saveSmsTemplate({ type, body });
      if (res.ok) {
        toast.success(`Šablóna „${SMS_TYPE_LABEL[type]}“ uložená.`);
        router.refresh();
      } else {
        toast.error(res.message ?? "Uloženie zlyhalo.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Link href="/menu" className="text-sm underline underline-offset-4">
        ← Späť na menu
      </Link>
      {types.map((type) => {
        const body = bodies[type];
        const segments = smsSegmentCount(body);
        const over = smsOverLimit(body);
        return (
          <section
            key={type}
            data-template-type={type}
            className="space-y-2 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between">
              <Label htmlFor={`tpl-${type}`} className="text-sm font-medium">
                {SMS_TYPE_LABEL[type]}
              </Label>
              <span
                data-counter
                className={`text-xs ${over ? "text-red-600" : "text-muted-foreground"}`}
              >
                {body.length} znakov · {segments} SMS
                {over && " · nad 70 znakov"}
              </span>
            </div>
            <textarea
              id={`tpl-${type}`}
              className="min-h-[80px] w-full rounded-md border bg-white p-2 text-sm"
              value={body}
              onChange={(e) =>
                setBodies((b) => ({ ...b, [type]: e.target.value }))
              }
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={pending || body.trim().length === 0}
                onClick={() => save(type)}
              >
                Uložiť
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
