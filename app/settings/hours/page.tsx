import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { getOpeningHours, getDayOverrides } from "@/lib/actions/settings";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { OpeningHoursEditor } from "@/components/settings/opening-hours-editor";
import { DayOverridesEditor } from "@/components/settings/day-overrides-editor";

/**
 * Merged Otváracie hodiny + Výnimky page (spec 18 / UI-STRUCTURE §10): the
 * weekly opening hours on top, the per-day overrides (holidays etc.) below, on
 * one page. The old `/settings/exceptions` route now redirects here.
 */
export default async function OpeningHoursPage() {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const [hours, overrides] = await Promise.all([getOpeningHours(), getDayOverrides()]);

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <OpeningHoursEditor initialHours={hours} />
      <DayOverridesEditor initialOverrides={overrides} />
    </div>
  );
}
