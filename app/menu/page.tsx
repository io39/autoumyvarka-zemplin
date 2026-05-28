import Link from "next/link";
import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";

export default async function MenuPage() {
  let staff;
  try {
    staff = await getCurrentStaff();
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Menu</h1>
      <nav className="flex flex-col gap-2 text-sm font-medium">
        <Link href="/" className="underline underline-offset-4">
          ← Kalendár
        </Link>
        <Link href="/clients" className="underline underline-offset-4">
          Klienti →
        </Link>
        {staff.role === "manazer" && (
          <>
            <Link href="/staff" className="underline underline-offset-4">
              Správa zamestnancov →
            </Link>
            <Link href="/services" className="underline underline-offset-4">
              Katalóg služieb →
            </Link>
            <Link href="/settings/hours" className="underline underline-offset-4">
              Otváracie hodiny →
            </Link>
            <Link href="/settings/exceptions" className="underline underline-offset-4">
              Výnimky (sviatky) →
            </Link>
            <Link href="/settings/sms-templates" className="underline underline-offset-4">
              SMS šablóny →
            </Link>
            <Link href="/audit" className="underline underline-offset-4">
              Záznam zmien →
            </Link>
          </>
        )}
      </nav>
    </main>
  );
}
