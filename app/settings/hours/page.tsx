import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { getOpeningHours } from "@/lib/actions/settings";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { OpeningHoursEditor } from "@/components/settings/opening-hours-editor";

export default async function OpeningHoursPage() {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const hours = await getOpeningHours();

  return (
    <div className="mx-auto max-w-2xl">
      <OpeningHoursEditor initialHours={hours} />
    </div>
  );
}
