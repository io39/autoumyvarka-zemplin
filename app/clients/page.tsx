import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { ClientSearch } from "@/components/clients/client-search";

export default async function ClientsPage() {
  try {
    await getCurrentStaff(); // both roles may view
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ClientSearch />
    </div>
  );
}
