# Tests

Two layers, one combined script.

| Command | Runs |
| --- | --- |
| `pnpm test` | unit (Vitest) **then** e2e (Playwright) |
| `pnpm test:unit` | unit only — `tests/unit/**/*.test.ts` (node env) |
| `pnpm test:e2e` | e2e only — `tests/e2e/**/*.spec.ts` |

**Targeted runs** (the spec's `pnpm test <path>` shorthand goes to Playwright via the
chained `test` script, so use the explicit runner):

```bash
pnpm test:unit auth/identity        # spec 01 §4.3
pnpm test:unit realtime/token       # spec 01 §4.6
pnpm test:e2e  staff-permissions    # spec 01 §4.4
pnpm test:e2e  staff-audit          # spec 01 §4.5
```

## Spec 01 §4.4 coverage note (deliberate)

§4.4 asks that the `createStaff` action be rejected for a worker and that a manager
self-deactivation return a Slovak error. These are covered by **unit tests of the exact
guards the actions call first** — `requireManager` (`tests/unit/auth/require.test.ts`)
and `isSelfDeactivation` (`tests/unit/actions/staff-guards.test.ts`) — plus the
page-level worker-403 e2e and the disabled self-deactivate control. Invoking a Server
Action directly from a test would require mocking `next/headers` + `next/cache` and
coupling the (pure) unit suite to the live DB; that infra cost isn't justified while the
guard logic and call-order are otherwise verified. Revisit if an action's guard grows
more complex than a single function call.

## Prerequisites

- **Unit tests:** none — pure logic, `server-only` is stubbed (see `vitest.config.ts`).
- **E2e tests:** the local Supabase stack must be up (`supabase start`) and seeded
  (`supabase db reset`). Playwright builds and starts the app itself.

## Why e2e runs against a production build, not `pnpm dev`

The Playwright `webServer` is `pnpm build && pnpm start`, not `pnpm dev`. Under
sandboxed/CI environments Turbopack's HMR websocket can fail, which blocks client
hydration — interactive tests (open dialog, submit form) then time out even though the
app is fine. A production build has no HMR and hydrates cleanly, and it matches how the
app actually ships. Cost: ~30s build per e2e invocation.

Identity in e2e is supplied per test via the `Cf-Access-Authenticated-User-Email`
header (see `tests/e2e/support.ts`). Under `NODE_ENV=production` the dev-auth shim is
inert, so the header path is exercised — the realistic one.
