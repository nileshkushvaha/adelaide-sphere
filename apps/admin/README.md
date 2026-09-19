# Adelaide Sphere Admin (`apps/admin`)

Independent admin frontend: React 19, TypeScript 6, Vite 8, Refine 5, Ant Design 5, React Router 7. Served under **`/admin/`** and talking to the NestJS API through same-origin **`/api/v1`** paths (SRS ARC 004, ARC 005).

> **Access control** is enforced by the API: every request under `/api/v1/admin` needs the `as_admin_session` cookie (HttpOnly) and a permission (SRS AUTH 002, RBAC 001–012). The app mirrors that with Refine's `<Authenticated>` around the shell and an auth provider that asks `GET /admin/auth/me`; nothing about the session is stored in web storage. `/admin` is `noindex`. Public exposure still awaits the remaining hardening phases (TLS, web-tier security headers, monitoring).

## Runtime contract

| Item | Value |
| --- | --- |
| Dev server | `http://127.0.0.1:4002/admin/` (strict port) |
| Vite `base` | `/admin/` |
| Router basename | `/admin` (derived from `import.meta.env.BASE_URL`) |
| API root in the browser | `/api/v1` (relative, same origin) |
| Dev/preview proxy | `/api/v1` → `ADMIN_API_PROXY_TARGET` (default `http://127.0.0.1:4001`), configured server-side in `vite.config.ts` only |
| Production | the reverse proxy serves `/` (web), `/admin/` (these static assets) and `/api/v1` (API); no proxy code ships in the bundle |

Direct navigation and refresh at any `/admin/...` URL work (Vite dev SPA fallback; production hosts must fall back to `/admin/index.html`).

## Commands (repository root)

| Command | Purpose |
| --- | --- |
| `pnpm dev:admin` | dev server on 4002 (needs `pnpm dev:api` for API status) |
| `pnpm build:admin` | production build to `apps/admin/dist` |
| `pnpm --filter admin preview` | serve the production build on 4002 with the same proxy |
| `pnpm lint:admin` / `pnpm typecheck:admin` / `pnpm test:admin` | ESLint 10, `tsc` (app + node configs), Vitest + Testing Library (jsdom) |

The aggregate `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check` include the admin app.

## Structure

```
src/
  main.tsx              bootstrap (StrictMode, global styles)
  app/                  App (BrowserRouter), AppProviders (theme → antd App → ErrorBoundary → Refine), routes
  config/               app-config (public constants), theme (Ant Design tokens)
  api/                  errors (ApiError, envelope parsing), http-client (typed fetch), health, data-provider (Refine)
  layouts/AdminShell    header, collapsible sider / mobile drawer, skip link, landmarks
  pages/                DashboardPage, NotFoundPage, admins/, account/, taxonomy/, businesses/
  components/           ApiStatus, ErrorBoundary, Brand
  shared/               useDocumentTitle, usePrefersReducedMotion
  styles/global.css     focus ring, skip link, reduced motion
  test/                 Vitest setup (matchMedia/ResizeObserver stubs), render helper, fetch fakes
```

Website → Menus (`pages/website/menus/`, SRS 1.9 MENU 002): the WordPress arrangement — content panels on the left (pages, posts, blog categories and tags, business categories, areas, published businesses, site routes, custom links and headings; most recent / view all / search, checkboxes, Add to menu), the menu structure on the right as a nested `@dnd-kit` sortable list (drag right to nest, clamped to the depth of the menu's locations; Move links as the keyboard alternative), a whole-tree save with `expectedVersion`, and a Manage locations tab. Tree operations are pure functions in `menu-tree.ts`; the structural rules are the shared `@adelaide-sphere/domain/menus`, re-checked by the API.

Screens (Phase 10): `pages/admins/AdministratorsPage` (paginated list, search/status filters via URL params, create dialog), `pages/admins/AdminDetailPage` (edit with `expectedVersion`, disable/enable with confirmation, setup-link resend, session revocation), `pages/account/AccountSecurityPage` (change password, sessions, TOTP enrol with `qrcode.react` QR + manual key, recovery codes shown once, disable), `pages/AuditLogPage`, `pages/AcceptSetupPage`; the login page gains the TOTP step (202 challenge → code). Navigation entries are hidden without the matching permission, purely as a courtesy.

## Permission-aware interface (SRS RBAC 010)

The server calculates effective permissions (role-inherited ∪ direct) and returns them from `GET /admin/auth/me`; this app never recreates role resolution. The pieces:

- `src/auth/permissions.ts` — typed codes and `ROUTE_PERMISSIONS`, the **one** mapping from route to required permissions. A contract test compares the codes with the API catalogue, so the two cannot drift.
- `src/auth/access-control.ts` — Refine's `accessControlProvider` (`can` by route path or by permission code) plus the capability context.
- `src/auth/RequirePermission.tsx` — wraps every route: a waiting state while capabilities are unknown, an accessible forbidden page when they are not held, never a flash of either.
- `useCapabilities().can('roles.update')` — how a component gates a button. No component compares raw permission strings.
- Screens: `pages/access/RolesPage`, `RoleEditorPage` (permission matrix grouped by module, protected system roles read-only), `PermissionCatalogPage` (read-only — codes are declared in the API and cannot be invented here) and `AdminAccessCard` on an administrator's page (roles, direct permissions, effective set with the source of each entry).

Hiding is a courtesy, not security: a URL typed by hand still reaches an API that answers 403. Full model and recipes: `docs/authorization.md`.

Listings (Phase 12): `businesses` is the first entry in `<Refine resources>`; `pages/businesses/BusinessesPage` reads through the data provider (`useList` with the documented sort/filter contract) and `pages/businesses/BusinessEditorPage` loads with `useOne` and mutates through the typed `src/api/businesses.ts` client (create, PATCH with `expectedVersion`, publish/unpublish/archive/restore). Dialog-driven state changes carry an optional reason and, when the API answers `DUPLICATE_SUSPECTED`, a required override reason; `PUBLICATION_BLOCKED` reasons come from `fields.publication`. A 401 during a mutation is passed to Refine's `useOnError`, so the auth provider redirects to sign in. Phase 13 adds `pages/businesses/HoursEditor` (weekly schedule and date exceptions saved through `PUT …/hours` with the business version; native `type="time"`/`type="date"` inputs; the API's `24:00` is shown as `00:00` + "closes next day") and link rows (kind, URL, label) on the editor; nested envelope field paths are mapped with `toNamePath` in `src/api/businesses.ts`.

Auth (Phase 9): `src/auth/auth-provider.ts` (Refine auth provider on the cookie session: login/logout/check/onError/getIdentity/getPermissions), `src/api/auth.ts` (typed calls using `@adelaide-sphere/contracts`), pages `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage` (public routes), the shell shows the signed-in admin and a Sign out button. Extension points: `resources={[]}` on `<Refine>` (register a resource when its API contract exists), `NAV_ITEMS` in `AdminShell`, `dataProvider` per-resource sorting/filtering via `LIST_CONTRACTS` (resources without an entry are refused with `ApiContractError` rather than guessed).

## API transport (`src/api`)

- `createHttpClient().request(path, options)`: relative `/api/v1` URLs, JSON in/out, empty-body handling (204 → `undefined`), `Accept`/`Content-Type` headers, `AbortSignal`, per-request timeout (15 s default), `credentials: 'same-origin'`. No auth headers, tokens or storage.
- Failures become `ApiError` with `kind` (`validation | unauthorized | forbidden | not_found | conflict | payload_too_large | rate_limited | server | unavailable | network | timeout | aborted | unexpected`), `status`, `code`, `fields`, `requestId` (from the `x-request-id` header, else the envelope), `retryAfterSeconds`, a user-safe `userMessage` and a `reference` for support. Non-JSON or malformed error bodies are classified by status and never retained.
- `dataProvider` maps Refine calls to `/api/v1/admin/<resource>` with the SRS envelopes (`{data}` / `{data, meta}`), `page`/`pageSize` pagination and REST verbs (`GET/POST/PATCH/DELETE`). Sorting and filtering are per-resource contracts (`LIST_CONTRACTS`; `businesses` maps a single sorter to `sort`/`order` and `eq`/`contains` filters to `q`, `status`, `categoryId`, `localAreaId`) and throw `ApiContractError` otherwise. Nothing is faked.

## Shell and accessibility

Skip link to `#main-content`; `banner`/`navigation`/`main`/`contentinfo` landmarks; one `h1` per page; document title `"<page> · Adelaide Sphere Admin"`; visible focus ring (amber-700, ≥ 3:1 on navy and white, with a white halo); 44 px menu items and 40 px controls; drawer navigation under the `lg` breakpoint with `aria-expanded`/`aria-controls`, Escape to close and focus restored to the toggle; `prefers-reduced-motion` disables Ant Design motion and CSS transitions. Theme tokens live in `src/config/theme.ts`; contrast pairs are asserted by `theme.test.ts`.

The dashboard's **API status** card calls `GET /api/v1/health` once on load and again only on "Check again"; it shows loading / reachable (with request ID) / unavailable (safe message + reference; a dev-proxy 502 when the API is down becomes a generic server message). It does not poll.

## Environment

`apps/admin/.env.example` documents the only variable, `ADMIN_API_PROXY_TARGET`, read server-side by `vite.config.ts` and validated to be a bare http(s) origin. No `VITE_*` variables exist; nothing secret is needed or allowed in this app.

## Known limitations

- Single JS chunk (~1.1 MB raw / ~350 kB gzip, mostly Ant Design + Refine). Code-splitting and the bundle budget are scheduled after the first vertical slice (SRS NFR 013).
- Only `businesses` is a Refine resource; the Administrators, Audit log, Account security and taxonomy screens call the typed clients directly with the `{data, meta}` envelope. Migrating them is optional polish, not a functional gap.
- `eslint-plugin-jsx-a11y` is not enabled because its latest release does not support ESLint 10; accessibility is covered by tests and manual checks until it does.

## Design system

`docs/design/admin-ui.md` is the contract for anything visual: tokens, page
structure, the shared components, the copy rules and the responsive and
accessibility rules. `docs/audits/admin-ui-inventory.md` records every route,
what was wrong with it and where it has been verified.

Two rules carry most of the weight:

* **Use the shared components.** `PageHeader`, `SectionCard`, `SettingsSection`,
  `TableCard`, `StatusTag`, `StickyActions`, `EmptyState`, `ErrorState`,
  `PermissionDenied`, `DangerZone`, `RecordMetadata`. A screen that invents its
  own card, empty state or status colour is the problem the system solves.
* **No internal codes in visible copy.** Specification identifiers, table names,
  endpoint paths and driver errors belong in comments, tests and `docs/` — never
  on screen. Numbers carry their units; limits are stated in plain language.
* **Some Ant defaults need a wrapper to be accessible.** A required select uses
  `FormSelect`; a table's expand control uses `expandToggle(describe)`; a row of
  short fields uses the `as-field-row` class rather than `Space`. Each exists
  because the Ant default failed axe or scrolled the page sideways at 320 px.

### Checking every screen

`e2e/scripts/route-sweep.ts` opens all 72 routes against a running API and admin
(1440 and 320 px, axe, overflow, console, headings, skip link, and a
moderation-only administrator's permissions) and writes a table for the
inventory:

```bash
DATABASE_URL=… OUT=/tmp/sweep node e2e/scripts/route-sweep.ts
```

`e2e/scripts/overflow-probe.ts` (`ROUTE=… WIDTH=320 AXE=1`) names the element
behind a failure. Both provision and remove their own administrators.

### Shared with other applications

`@adelaide-sphere/domain/alerts` — the service-alert severity table (colours,
tone, role, politeness) and the link validator — is the admin's only runtime
code from another workspace package (`@adelaide-sphere/contracts` supplies
types only). It is plain TypeScript, imported as a
subpath so nothing else from `domain` reaches the bundle. The admin's tests and
build need it built first (`pnpm domain:build`, which `pnpm check` runs).

## AI Content Phase 1A

The existing admin/API now supports disabled automation configuration and a manual topic queue with versioned actions, request replay protection, active-title deduplication and transactional audit. No provider, article generation or scheduler execution is included. The additive `20260918120000_ai_content_topics` migration and existing RBAC synchronization are required on rollout; neither has been run against retained environments in this implementation session. See the [Phase 1A completion report](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1a-completion.md) for exact routes, permissions, checks and rollback instructions.

## AI Content Phase 1B

The article seam shared by the API and the worker lives in `@adelaide-sphere/database/editorial` (sanitiser, media references, revisions, material hash, the AI publication policy used by both the publish/schedule commands and the scheduled publisher). Durable AI work (control epoch, leased and fenced operations, recovery, applying a generation run to its one canonical article) lives in `@adelaide-sphere/database/automation`. Both subpaths are backend-only. The additive migration `20260918150000_ai_content_editorial_foundation` has been applied only to the isolated test database. See the [Phase 1B completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1b-completion.md).

## AI Content Phase 1C

Free public research (SSRF-safe retrieval in the worker, evidence, typed claims, freshness), Needs Fact Review, local novelty admission with the inventory epoch, feed discovery and the research source registry. Shared rules are in `@adelaide-sphere/domain` (`ai-novelty`, `ai-research`); the database seam is in `@adelaide-sphere/database/automation`. Migration `20260918170000_ai_content_research` has been applied only to the isolated test database. See the [Phase 1C completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1c-completion.md).

## AI Content Phase 1D

Budgeted, reviewed text generation from the verified research packet:

- a provider-neutral text seam, with the OpenAI Responses adapter in the worker (built only when `OPENAI_API_KEY` is set in the server environment);
- approved models as code constants;
- versioned approved prices and day/month/workflow reservations, with the paid-call halt on discrepancy;
- fact and name coverage;
- proposals with CAS apply;
- research-bound approval and unknown-outcome resolution.

New permissions: `ai_content.generate` and `ai_content.approve`. Migration `20260918190000_ai_content_generation` has been applied only to the isolated test database. No live provider call has been made. See the [Phase 1D completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1d-completion.md).

## AI Content Phase 1E

Featured images: hybrid and prompt-only by default. A paid image is made only through an explicit Generate image action; automatic mode is not approved.

- **Provider:** a provider-neutral image seam with the OpenAI Image API adapter in the worker, using the same server-side `OPENAI_API_KEY`.
- **Cost:** versioned image prices with a per-image output-token bound, and a separate image budget.
- **Media:** intake through the existing quarantine and media processing; a provider URL is never kept.
- **Approval and publication:** human approval with alt text written from the actual image; a required featured image in the shared publication policy.

Migration `20260919100000_ai_content_images` has been applied only to the isolated test database. See the [Phase 1E completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1e-completion.md).

## AI Content Phase 1F

The daily slot:

- one slot at a configured local time (07:00 Australia/Adelaide) with a monthly ceiling;
- it starts free research for the next topic a person approved for it (`approve_for_slot`), and never generates, spends or publishes;
- missed slots are held for review, never caught up.

The slot is unique per local date (registered task `ai-content.plan-slots`). AI operations run on their own queue, `adelaide-sphere-ai`, with a bounded consumer (`AI_WORKER_CONCURRENCY`, default 1). Migration `20260919140000_ai_content_schedule` has been applied only to the isolated test database. See the [Phase 1F completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1f-completion.md).

## AI Content Phase 1G

Hardening, with auto-publishing not approved:

- final novelty and internal-link checks at publication (both paths);
- retry of a failed first draft;
- operator signals (`as_ai_*` gauges, alert rules AI1–AI6, and the dashboard "Needs attention" card);
- 180-day retention of private AI working data (task `ai-content.retention`).

Operations: `docs/operations/ai-content-runbook.md`. Migration `20260919180000_ai_content_retention` has been applied only to the isolated test database. See the [Phase 1G completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1g-completion.md).
