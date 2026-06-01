/**
 * Slovak 401/403 views (spec 01 §2.6). Rendered by pages when the edge identity
 * is missing (401) or lacks the required role (403). All copy is Slovak.
 *
 * Landmark element (spec 12): the app shell owns the single page `<main>`.
 * - `UnauthenticatedView` is only ever shown in the shell's **chrome-less
 *   passthrough** (no identity resolves → no shell `<main>`), so it provides the
 *   `<main>` landmark itself and fills the screen.
 * - `ForbiddenView` is shown when an authenticated worker hits a manager-only
 *   page — the identity resolves, so the **full shell renders** and this view
 *   sits *inside* the shell's `<main>`. It must therefore be a plain `<div>`
 *   (a nested `<main>` is invalid and breaks the single-`<main>` invariant).
 */

const PANEL = "mx-auto flex max-w-md flex-col items-center justify-center gap-2 p-6 text-center";

function Panel({
  standalone,
  code,
  title,
  message,
}: {
  standalone: boolean;
  code: string;
  title: string;
  message: string;
}) {
  const body = (
    <>
      <p className="text-sm font-medium text-muted-foreground">{code}</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </>
  );

  // Standalone (passthrough): own the <main> landmark and fill the viewport.
  if (standalone) {
    return <main className={`min-h-dvh ${PANEL}`}>{body}</main>;
  }
  // In-shell: plain element, centered within the content column.
  return <div className={`min-h-[60vh] ${PANEL}`}>{body}</div>;
}

export function ForbiddenView() {
  return (
    <Panel
      standalone={false}
      code="403"
      title="Nemáte oprávnenie"
      message="Táto sekcia je dostupná iba pre manažéra."
    />
  );
}

export function UnauthenticatedView() {
  return (
    <Panel
      standalone
      code="401"
      title="Neoverená identita"
      message="Vašu identitu sa nepodarilo overiť. Skúste znova načítať stránku."
    />
  );
}
