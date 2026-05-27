/**
 * Slovak 401/403 views (spec 01 §2.6). Rendered by pages when the edge identity
 * is missing (401) or lacks the required role (403). All copy is Slovak.
 */

function Shell({ code, title, message }: { code: string; title: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">{code}</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}

export function ForbiddenView() {
  return (
    <Shell
      code="403"
      title="Nemáte oprávnenie"
      message="Táto sekcia je dostupná iba pre manažéra."
    />
  );
}

export function UnauthenticatedView() {
  return (
    <Shell
      code="401"
      title="Neoverená identita"
      message="Vašu identitu sa nepodarilo overiť. Skúste znova načítať stránku."
    />
  );
}
