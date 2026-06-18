---
name: edge-auth-authz
description: Use when writing Server Actions, Route Handlers, pages, or anything that reads the current user, checks a role, or sets up a Realtime subscription. Encodes this project's edge-auth model, role helpers, the dev-shim production hard-guard, and the server-minted Realtime JWT.
---

# Edge auth + in-app authorization

Authentication is at the **edge**, not in the app. Cloudflare Access (Zero Trust)
gates the whole site via a Cloudflare Tunnel; the app does **authorization only** —
it maps the edge identity to a role and enforces per-action rules (PRD §3). There is
**no in-app login screen**. Supabase RLS is defense-in-depth, not the primary gate.

## Identity → role (use the helpers, never re-read headers ad hoc)

- `getIdentity()` (`lib/auth/identity.ts`): returns the authenticated email.
  - **Production:** reads `Cf-Access-Authenticated-User-Email`. Missing ⇒ throw
    `UnauthenticatedError` (deny). Never falls back to a default identity.
  - **Dev shim:** only when `NODE_ENV !== 'production'` and `DEV_AUTH_EMAIL` is set.
- `getCurrentStaff()`: maps the email to an **active** `staff` row → `{ id, email,
  role, display_name }`; throws if no active match.
- `requireManager(staff)` / `requireRole(staff, role)`: assert the resolved actor's
  role, throw `ForbiddenError` otherwise.

## Hard rules

1. **Every mutating Server Action calls a role helper first**, before any DB write.
   No mutation trusts the client for the actor's role.
2. **The dev-auth shim is hard-guarded:** it must refuse to activate when
   `NODE_ENV === 'production'`, even if `DEV_AUTH_EMAIL` is set. A missing identity
   header in production is an error, never a fallback.
3. **PRD §3 permission matrix is the source of truth** for which role may do what.
   Manager-only: edit order data, move/delete order, mark `nedostavil_sa`, edit notes,
   manage catalog & staff. Both roles: view calendar, create order, assign worker,
   mark `hotova`/`zaplatena`, view client history.
4. **Every state change writes `audit_log`** with the actor identity (`actor_email`,
   `actor_staff_id`).

## Realtime subscriptions (browser)

Supabase Cloud is **not** behind Cloudflare — the public anon key is internet-reachable.
So the browser must **not** rely on anon read policies for client data.

- Initial page/calendar load is **server-rendered** via `service_role` (server-only key).
- The live subscription uses a **short-lived JWT minted server-side**
  (`lib/realtime/token.ts`, signed with `SUPABASE_JWT_SECRET`, carrying
  `role: 'authenticated'` + identity). RLS read policies require that claim; the bare
  anon key grants nothing.
- **Always subscribe via the `useRealtimeChannel` hook** (`lib/realtime/use-realtime.ts`),
  never `createClient` directly. The browser Supabase client is a **shared singleton**
  (`lib/realtime/browser.ts`): many consumers mount per page (calendar + unpaid/
  out-of-hours badges & lists) and one client = one websocket = one `GoTrueClient`
  (avoids the "Multiple GoTrueClient instances" warning + unbounded accumulation on a
  long-lived tablet). Because the client is shared, **channel topics must be globally
  unique** — the hook hands your `subscribe(client, channelName)` callback a unique
  name; pass it to `client.channel(channelName)` and **do not hardcode a topic**
  (a reused name makes the 2nd `.on()` throw "cannot add postgres_changes callbacks
  after subscribe()" and crashes the page). The hook also keeps the token fresh in
  place (ref-counted refresh) so a re-mint never tears the channel down.

## Typical Server Action shape

```ts
export async function moveOrder(input: unknown) {
  const data = moveOrderSchema.parse(input);      // zod at the boundary
  const staff = await getCurrentStaff();
  requireManager(staff);                           // PRD §3: only manager may move
  // ...mutate via service_role client...
  await writeAudit(staff, "order.status_change", "order", data.id, { ... });
}
```

## Don't

- Don't build a login page or password flow.
- Don't check roles in the client/UI only — the gate lives in the Server Action.
- Don't expose `service_role` or `SUPABASE_JWT_SECRET` to the browser.
