import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { getClientWithHistory } from "@/lib/actions/clients";
import { getClientFlags } from "@/lib/actions/orders";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { ClientSearch } from "@/components/clients/client-search";
import { ClientDetail } from "@/components/clients/client-detail";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  let role;
  try {
    const actor = await getCurrentStaff(); // both roles may view
    role = actor.role;
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const { id } = await searchParams;
  const [detail, clientFlags] = id
    ? await Promise.all([getClientWithHistory(id), getClientFlags({ clientId: id })])
    : [null, null];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="sm:w-80 sm:shrink-0">
          <ClientSearch />
        </div>
        <div className="min-w-0 flex-1">
          {!id ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Vyhľadajte zákazníka a vyberte ho zo zoznamu.
            </p>
          ) : detail ? (
            <ClientDetail
              client={detail.client}
              histories={detail.cars}
              role={role}
              flags={clientFlags ?? { overdueUnpaidCount: 0, unpaidAmountCents: 0, noShowCount: 0 }}
            />
          ) : (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Klient sa nenašiel.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
