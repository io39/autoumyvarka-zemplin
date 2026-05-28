import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { listServices } from "@/lib/actions/services";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { ServicesManager } from "@/components/services/services-manager";

export default async function ServicesPage() {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const services = await listServices({ includeInactive: true });

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <ServicesManager initialServices={services} />
    </main>
  );
}
