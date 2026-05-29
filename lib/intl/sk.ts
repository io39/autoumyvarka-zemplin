/**
 * Slovak count-noun agreement. Slovak picks a different noun form by count:
 *   1            → nominative singular   ("1 objednávka")
 *   2–4          → nominative plural     ("3 objednávky")
 *   0, 5+        → genitive plural        ("5 objednávok")
 * (Counts in this app are small, so the simple 1 / 2–4 / rest split is exact.)
 */
export function skPlural(
  n: number,
  forms: { one: string; few: string; many: string },
): string {
  if (n === 1) return forms.one;
  if (n >= 2 && n <= 4) return forms.few;
  return forms.many;
}
