import { redirect } from "next/navigation";

/**
 * Otváracie hodiny + Výnimky are merged onto `/settings/hours` (spec 18 /
 * UI-STRUCTURE §11). This route is kept as a deep-link target — the nav points
 * only at `/settings/hours` (spec 12) — and now redirects there. Don't delete
 * it, or any lingering `/settings/exceptions` bookmark/link would 404.
 */
export default async function DayOverridesRedirect() {
  redirect("/settings/hours");
}
