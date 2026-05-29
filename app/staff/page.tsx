import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { listStaff } from "@/lib/actions/staff";
import { listWorkers } from "@/lib/actions/workers";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { StaffManager } from "@/components/staff/staff-manager";
import { WorkerManager } from "@/components/staff/worker-manager";

export default async function StaffPage() {
  let currentStaffId: string;
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
    currentStaffId = actor.id;
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const [staff, workers] = await Promise.all([listStaff(), listWorkers()]);

  return (
    <main className="mx-auto max-w-3xl space-y-10 p-4 sm:p-6">
      <StaffManager initialStaff={staff} currentStaffId={currentStaffId} />
      <WorkerManager initialWorkers={workers} />
    </main>
  );
}
