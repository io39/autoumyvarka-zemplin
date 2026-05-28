import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { getDayOverrides } from "@/lib/actions/settings";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { DayOverridesEditor } from "@/components/settings/day-overrides-editor";

export default async function DayOverridesPage() {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const overrides = await getDayOverrides();

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <DayOverridesEditor initialOverrides={overrides} />
    </main>
  );
}
