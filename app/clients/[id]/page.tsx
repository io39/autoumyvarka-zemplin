import { redirect } from "next/navigation";

/**
 * Deep-link entry kept for backwards compatibility (spec 17 / UI-STRUCTURE §9):
 * order detail, the booking wizard, and `revalidatePath("/clients/[id]")` all
 * target this route. It now redirects to the merged master-detail page
 * `/clients?id=<id>` — never delete it, or those links 404 and revalidation
 * goes stale.
 */
export default async function ClientDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/clients?id=${id}`);
}
