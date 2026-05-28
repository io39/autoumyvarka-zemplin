import Link from "next/link";
import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<string, string> = {
  manazer: "Manažér",
  prevadzka: "Prevádzka",
};

export default async function HomePage() {
  let staff;
  try {
    staff = await getCurrentStaff();
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Autoumyváreň Zemplín</h1>
        <p className="text-sm text-muted-foreground">Rezervačný systém</p>
      </header>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Prihlásený používateľ</h2>
        <p className="font-medium">{staff.display_name}</p>
        <p className="text-sm text-muted-foreground">{staff.email}</p>
        <div className="mt-3">
          <Badge variant={staff.role === "manazer" ? "default" : "secondary"}>
            {ROLE_LABEL[staff.role] ?? staff.role}
          </Badge>
        </div>
      </section>

      {staff.role === "manazer" && (
        <nav className="flex flex-col gap-2 text-sm font-medium">
          <Link href="/staff" className="underline underline-offset-4">
            Správa zamestnancov →
          </Link>
          <Link href="/clients" className="underline underline-offset-4">
            Klienti →
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
        </nav>
      )}
    </main>
  );
}
