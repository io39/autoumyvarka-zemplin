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

## Action-level authorization — project-wide coverage convention (deliberate)

Several specs phrase acceptance criteria as "action X rejected for a worker with
`ForbiddenError`" (spec 01 §4.4 self-deactivation/worker-create; spec 02 §4.5
`updateClient`/`updateCar`; and similar in later specs). We do **not** invoke Server
Actions directly from tests — that would require mocking `next/headers` + `next/cache`
and coupling the (pure, DB-free) unit suite to the live database.

Instead, action-level authorization is covered by:
1. **Unit tests of the exact guard each action calls first** — `requireManager`
   (`tests/unit/auth/require.test.ts`), `isSelfDeactivation`
   (`tests/unit/actions/staff-guards.test.ts`), etc.
2. **Static guarantee** that every mutating action calls the guard before any DB write
   (enforced by review + the edge-auth skill).
3. **UI/page e2e** that workers don't see manager-only affordances (edit buttons hidden,
   `/staff` 403 view).

Revisit (add a real integration harness) if an action's guard ever grows more complex
than a single guard call, or if a regression slips past 1–3.

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
