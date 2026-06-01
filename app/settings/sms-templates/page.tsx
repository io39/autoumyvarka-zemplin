import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { getSmsTemplates } from "@/lib/actions/sms";
import { SmsTemplatesEditor } from "@/components/settings/sms-templates-editor";

export default async function SmsTemplatesPage() {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const templates = await getSmsTemplates();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold">SMS šablóny</h1>
        <p className="text-sm text-muted-foreground">
          Texty automatických správ. Placeholdery <code>{"{cas}"}</code>,{" "}
          <code>{"{spz}"}</code>, <code>{"{nazov}"}</code> sa pri odoslaní nahradia.
          Limit pre jednu SMS s diakritikou je 70 znakov.
        </p>
      </header>
      <SmsTemplatesEditor initial={templates} />
    </div>
  );
}
