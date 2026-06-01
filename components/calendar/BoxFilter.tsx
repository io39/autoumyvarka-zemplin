"use client";

import { Button } from "@/components/ui/button";

/**
 * Mobile-only Box 1 / Box 2 toggle (spec 14 §2.5). Desktop (`sm:+`) always shows
 * both boxes side by side, so the filter is hidden there. No "Obe" option.
 */
export function BoxFilter({
  activeBox,
  onChange,
}: {
  activeBox: 1 | 2;
  onChange: (box: 1 | 2) => void;
}) {
  return (
    <div className="flex gap-1 sm:hidden" data-box-filter>
      {([1, 2] as const).map((box) => (
        <Button
          key={box}
          size="sm"
          variant={activeBox === box ? "default" : "ghost"}
          onClick={() => onChange(box)}
          data-box-option={box}
        >
          Box {box}
        </Button>
      ))}
    </div>
  );
}
