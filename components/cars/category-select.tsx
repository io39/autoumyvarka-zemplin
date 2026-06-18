import type { PricingCategory } from "@/lib/supabase/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Slovak labels for the 6 pricing categories (data-model §2.5). */
export const CATEGORY_LABEL: Record<PricingCategory, string> = {
  os: "Osobné",
  suv: "SUV",
  van: "Van",
  dod: "Dodávka",
  motorka: "Motorka",
  stavba: "Stavebné",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as PricingCategory[];

/** A `name="pricingCategory"` select for the car add/edit forms. */
export function CategorySelect({ defaultValue }: { defaultValue?: PricingCategory }) {
  return (
    <Select name="pricingCategory" defaultValue={defaultValue ?? "os"}>
      <SelectTrigger id="pricingCategory">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
