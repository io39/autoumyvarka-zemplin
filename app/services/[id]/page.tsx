import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { getServiceWithPrices } from "@/lib/actions/services";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { ServiceEditor } from "@/components/services/service-editor";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const { id } = await params;
  const data = await getServiceWithPrices(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <ServiceEditor service={data.service} prices={data.prices} />
    </div>
  );
}
