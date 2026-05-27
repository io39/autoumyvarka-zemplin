import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { getClientWithCars } from "@/lib/actions/clients";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { ClientDetail } from "@/components/clients/client-detail";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let role;
  try {
    const actor = await getCurrentStaff();
    role = actor.role;
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const detail = await getClientWithCars(id);
  if (!detail) notFound();

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <ClientDetail client={detail.client} cars={detail.cars} role={role} />
    </main>
  );
}
