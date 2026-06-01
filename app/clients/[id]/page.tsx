import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { getClientWithHistory } from "@/lib/actions/clients";
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

  const detail = await getClientWithHistory(id);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <ClientDetail
        client={detail.client}
        cars={detail.cars.map((c) => c.car)}
        histories={detail.cars}
        role={role}
      />
    </div>
  );
}
