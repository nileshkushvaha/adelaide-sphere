# Admin UI inventory

**Started:** 10 September 2026 · **Last swept:** 12 September 2026 (admin-wide sweep, workstream I) · **Scope:** every route in `apps/admin/src/app/routes.tsx`.

This is the working record for the admin redesign: what each screen is, what was
wrong with it, what it now uses, and whether it has been looked at in a real
browser rather than only in a test.

**Design** is `done` (converted and verified in a browser) or `partial` (on the
shared system and passing the sweep, with a named piece of work outstanding).

## Page types

| Type | What it is | Shared pattern |
| --- | --- | --- |
| Dashboard | Operational overview, permission-filtered | `StatCard`, real counts only |
| List | A collection with filters and paging | `PageHeader` + `TableCard` + `EmptyState` |
| Editor | Create or edit one record | `RecordEditorPage` + `SectionCard` + `StickyActions` |
| Detail | One record, read-first | `PageHeader` + `SectionCard` + `RecordMetadata` |
| Settings | Server-declared values | `SettingsSection` + units + `StickyActions` |
| Moderation | A queue of submitted content | `TableCard` + explicit decision actions |
| Operations | Infrastructure state and safe actions | `TableCard` + `StatusTag` + confirmations |
| Auth | Unauthenticated screens | `AuthScreen` |
| Status | Not found, forbidden, loading | `EmptyState`, `PermissionDenied`, `PageLoader` |

## Routes

Every route in `apps/admin/src/app/routes.tsx` is on the shared system. **Design**
is `done` unless a named piece is outstanding. **Permission** is what the admin's
route table (`apps/admin/src/auth/permissions.ts`) requires to open the screen;
the API enforces its own rule on every request whatever the screen shows.

| Route | Type | Permission to open | Design |
| --- | --- | --- | --- |
| `/` | Dashboard | session | done — worker and queue health, permission-filtered counts |
| `/businesses` | List | `listings.read` | done |
| `/businesses/new`, `/businesses/:id` | Editor | `listings.read` (saving needs `listings.write`) | done — ten sections, publication blockers beside publish, private enquiry address kept apart, public-address change with its redirect, unsaved-changes guard |
| `/businesses/featured` | List | `listings.read` | done |
| `/businesses/featured/new` | Editor | `listings.publish` | done — copy, Melbourne offset for the date entered, the overlap rule, and a preview of the card the placement puts on screen, read from the public route for the chosen listing |
| `/categories`, `/services`, `/areas` and their editors | List/Editor | `taxonomy.manage` | done |
| `/media` | List | `media.manage` | done — drag-and-drop with a keyboard path, upload progress, a definite "processing has stopped" state |
| `/media/:id` | Detail | `media.manage` | done — renditions, focal-point picker, every place the image is used |
| `/posts`, `/posts/new`, `/posts/:id` | List/Editor | `posts.write` | done — the server's preview of the saved draft, search and social previews |
| `/authors`, `/blog-categories`, `/blog-tags` and their editors | List/Editor | `posts.write` | done |
| `/enquiries` | Moderation | `enquiries.read` | done |
| `/reviews`, `/comments`, `/reports` | Moderation | `reviews.moderate` / `comments.moderate` / `reports.manage` | done |
| `/settings/general` | Settings | `settings.manage` | done |
| `/settings` | Settings | `settings.manage` | done — copy, layout, the banner focal-point picker, and a desktop-and-phone likeness of the hero drawn from the unsaved form |
| `/redirects`, `/redirects/new` | List/Editor | `redirects.manage` | done — 301/302/410, on/off state, "Test an address" |
| `/admins`, `/admins/new`, `/admins/:id` | List/Editor/Detail | `admins.manage` (changing access needs `admins.access.manage`) | done — each permission's source by role name, grants the actor lacks withheld, the change named before it is confirmed |
| `/account` | Settings | session | done |
| `/roles`, `/roles/new`, `/roles/:id` | List/Editor | `roles.view` (editing needs `roles.create` / `roles.update`) | done |
| `/permissions` | List | `permissions.view` | done — search across label, code and description, module and state filters |
| `/audit` | Operations | `audit.read` | done — date range in Melbourne days, who did it, readable wording, forensic detail in an expandable row |
| `/security/settings` | Settings | `security.settings.view` | done — reference screen |
| `/system/email-logs`, `/system/queues`, `/system/schedules`, `/system/cache` | Operations | `system.email_logs.view`, `system.queues.view`, `system.schedules.view`, `system.cache.view` | done |
| `/website/pages`, `/website/pages/new`, `/website/pages/:slug`, `/pages` (redirect) | List/Editor | `settings.manage` | done |
| `/website/faqs`, `/website/testimonials`, `/website/partners` and their editors | List/Editor | `website.*.view` / `.create` / `.update` | done |
| `/website/service-alerts` and its editor | List/Editor | `website.alerts.view` / `.create` / `.update` | done — preview drawn from the shared alert table at phone and desktop width, scheduling in Melbourne time |
| `/login`, `/forgot-password`, `/reset-password`, `/accept-setup` | Auth | public | done |
| `*` | Status | — | done |

## The route sweep (12 September 2026)

`e2e/scripts/route-sweep.ts` opened all 72 routes, including every editor whose
path carries an id (resolved from the development database), and checked each at
1440 px and 320 px. It then signed in as an administrator holding only
moderation permissions and compared what opened, what was refused and what the
navigation offered with the admin's own route-permission table.

**Result: 72 routes, 0 unchecked, 0 findings.** The first run found 21 routes
with a finding. Every one is fixed and listed under "Defects the full sweep
found" below.

What each column checks:

* **axe**: WCAG 2.2 A/AA rules, whole document.
* **320 fits**: the page does not scroll sideways at 320 px (tables scroll
  inside their own card).
* **Console**: no console error and no uncaught exception while the route loads.
  On a signed-out screen, the 401 from the session check is the expected answer
  and is not counted.
* **One h1 + main**: exactly one `h1` at both widths, and a main landmark.
* **Skip link**: the first Tab from the top reaches "Skip to main content"
  (signed-in screens; the signed-out screens have no navigation to skip).
* **Moderator**: as a moderation-only administrator, `open` or `forbidden` as
  the route-permission table says, with the navigation offering the link exactly
  when the route opens. `n/a` for signed-out screens, the `/pages` redirect and
  the not-found route.

Screen readers were not driven directly. The sweep checks what a screen reader
depends on: names, roles, states, landmarks, heading structure and focus order.

| Route | 1440 axe | 320 axe | 320 fits | Console | One h1 + main | Skip link | Moderator |
|---|---|---|---|---|---|---|---|
| `/login` | pass | pass | pass | pass | pass | pass | n/a |
| `/forgot-password` | pass | pass | pass | pass | pass | pass | n/a |
| `/reset-password` | pass | pass | pass | pass | pass | pass | n/a |
| `/accept-setup` | pass | pass | pass | pass | pass | pass | n/a |
| `/` | pass | pass | pass | pass | pass | pass | open |
| `/businesses` | pass | pass | pass | pass | pass | pass | forbidden |
| `/businesses/featured` | pass | pass | pass | pass | pass | pass | forbidden |
| `/businesses/featured/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/businesses/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/businesses/:business` | pass | pass | pass | pass | pass | pass | forbidden |
| `/categories` | pass | pass | pass | pass | pass | pass | forbidden |
| `/categories/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/categories/:category` | pass | pass | pass | pass | pass | pass | forbidden |
| `/services` | pass | pass | pass | pass | pass | pass | forbidden |
| `/services/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/services/:service` | pass | pass | pass | pass | pass | pass | forbidden |
| `/areas` | pass | pass | pass | pass | pass | pass | forbidden |
| `/areas/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/areas/:area` | pass | pass | pass | pass | pass | pass | forbidden |
| `/media` | pass | pass | pass | pass | pass | pass | forbidden |
| `/media/:media` | pass | pass | pass | pass | pass | pass | forbidden |
| `/posts` | pass | pass | pass | pass | pass | pass | forbidden |
| `/posts/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/posts/:post` | pass | pass | pass | pass | pass | pass | forbidden |
| `/authors` | pass | pass | pass | pass | pass | pass | forbidden |
| `/authors/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/authors/:author` | pass | pass | pass | pass | pass | pass | forbidden |
| `/blog-categories` | pass | pass | pass | pass | pass | pass | forbidden |
| `/blog-categories/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/blog-categories/:blogCategory` | pass | pass | pass | pass | pass | pass | forbidden |
| `/blog-tags` | pass | pass | pass | pass | pass | pass | forbidden |
| `/blog-tags/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/blog-tags/:blogTag` | pass | pass | pass | pass | pass | pass | forbidden |
| `/enquiries` | pass | pass | pass | pass | pass | pass | forbidden |
| `/comments` | pass | pass | pass | pass | pass | pass | open |
| `/reviews` | pass | pass | pass | pass | pass | pass | open |
| `/reports` | pass | pass | pass | pass | pass | pass | forbidden |
| `/settings/general` | pass | pass | pass | pass | pass | pass | forbidden |
| `/settings` | pass | pass | pass | pass | pass | pass | forbidden |
| `/redirects` | pass | pass | pass | pass | pass | pass | forbidden |
| `/redirects/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/admins` | pass | pass | pass | pass | pass | pass | forbidden |
| `/admins/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/admins/:admin` | pass | pass | pass | pass | pass | pass | forbidden |
| `/account` | pass | pass | pass | pass | pass | pass | open |
| `/roles` | pass | pass | pass | pass | pass | pass | forbidden |
| `/roles/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/roles/:role` | pass | pass | pass | pass | pass | pass | forbidden |
| `/permissions` | pass | pass | pass | pass | pass | pass | forbidden |
| `/audit` | pass | pass | pass | pass | pass | pass | forbidden |
| `/system/email-logs` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/pages` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/pages/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/pages/:page` | pass | pass | pass | pass | pass | pass | forbidden |
| `/pages` | pass | pass | pass | pass | pass | pass | n/a |
| `/website/faqs` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/faqs/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/faqs/:faq` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/service-alerts` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/service-alerts/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/service-alerts/:alert` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/testimonials` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/testimonials/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/testimonials/:testimonial` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/partners` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/partners/new` | pass | pass | pass | pass | pass | pass | forbidden |
| `/website/partners/:partner` | pass | pass | pass | pass | pass | pass | forbidden |
| `/security/settings` | pass | pass | pass | pass | pass | pass | forbidden |
| `/system/cache` | pass | pass | pass | pass | pass | pass | forbidden |
| `/system/queues` | pass | pass | pass | pass | pass | pass | forbidden |
| `/system/schedules` | pass | pass | pass | pass | pass | pass | forbidden |
| `/this-route-does-not-exist` | pass | pass | pass | pass | pass | pass | n/a |

To rerun it against a running API and admin:

```bash
DATABASE_URL=… OUT=/tmp/sweep node e2e/scripts/route-sweep.ts
```

It provisions and removes its own administrators and refuses a database whose
name does not end in `_dev`, `_test` or `_e2e`. Where an editor has nothing to
open, it writes one unpublished draft and deletes it at the end.

## Cross-cutting problems this redesign is fixing

1. **Internal specification codes in visible copy.** `Bounded by AUTH 002` and
   similar appeared on the security screen. Codes belong in code comments and
   documentation. Fixed at the source: the server registry now sends a unit and
   a plain-language limit, and keeps `boundedBy` internal.
2. **Numbers without units.** `30` told an administrator nothing. Every declared
   number now carries what it counts.
3. **Save actions below the fold.** Long forms now use `StickyActions`.
4. **Inconsistent table framing.** Lists now share `TableCard`.
5. **Status vocabulary.** One `StatusTag` maps every state to one tone and one
   word across modules.
6. **Hard-coded colour.** Screens now read `brand` tokens from
   `apps/admin/src/config/theme.ts`.

## Defects the browser pass found (10 September 2026)

Each was found by running the interface, not by reading it, and each is fixed:

1. **`Bounded by AUTH 002` on the security screen.** An internal specification
   code, shown to an administrator. Fixed at the source: the server registry now
   carries a unit and a plain-language limit, and keeps its own justification
   internal.
2. **Numbers with no units.** `30` in a box. Every declared number now shows what
   it counts.
3. **The account screen was titled "Dashboard".** Screens reached from the
   account menu were not in the navigation map the top bar reads.
4. **Raw addresses and user-agent strings** in the session list. Now "Same
   machine as the server" for a loopback address, and "Chrome on macOS".
5. **Empty-table text failed contrast** (Ant's default `rgba(0,0,0,0.25)`).
6. **The "View site" link had no accessible name on a phone**, where its label is
   dropped for room.
7. **The queue monitor scrolled the page sideways at 390 px** — a wide table and a
   five-item filter row. Both now scroll inside their own card.
8. **The top bar overflowed at 320 px.** The wordmark now collapses to its mark.
9. **Deleting a role asked for no confirmation.**
10. **`Sort: updatedAt`** — a database column offered as a sort option.

## Defects the full sweep found (12 September 2026)

1. **Every editor with a side column was broken below 992 px.** `RecordEditorPage`
   held `1fr 320px` at every width, so on a phone the form collapsed to nothing
   and the side column pushed the page sideways. It now stacks.
2. **Ant's preset tag colours failed contrast** (green 3.4:1) on nine list
   screens. Status columns now use `StatusTag`, and a stylesheet rule raises
   every remaining preset to at least 6.6:1.
3. **Expand buttons with no name** on Enquiries, Reviews, Comments and Reports,
   so a screen reader heard "button" on every row. `expandToggle` names the row
   and says whether it is open.
4. **Required dropdowns put `aria-required` on a wrapper with no role** (nine
   fields). `FormSelect` keeps it on the combobox only.
5. **An unlabelled file input** in the media library, which was also a second
   tab stop for the same action. It is now named and out of the tab order, behind
   its button.
6. **Four screens scrolled sideways at 320 px**: the business editor (link rows
   and the weekly-hours grid), home settings (phrase rows), and the permissions
   and website-pages tables (no scroll container of their own).
7. **Placeholder text failed contrast** everywhere (Ant's default, 2.3:1). The
   theme's placeholder colour is now 4.8:1.
8. **Permission codes on the permissions screen failed contrast** (grey text on
   Ant's grey code background), and so did the article editor's social-preview
   placeholder (4.34:1).
9. **A deprecated control API** on security settings logged a warning on every
   render.
10. **Report reasons appeared as stored codes** (`privacy`, `spam`).

## Verification

* `e2e/scripts/route-sweep.ts`: every route, as described above.
* `e2e/specs/admin-ui.spec.ts`, part of the release gate: axe over one screen of
  each page family (now including the media library, redirects and the alert
  editor), the overflow rule at 1440/1280/1024/768/390/320, the access editor's
  keyboard path, the drawer on a phone, the save bar not covering the last
  field, and permission-filtered navigation.
* `apps/admin/src/components/ui/design-system.test.tsx` — the shared components'
  contracts.
* `apps/admin/src/pages/security/SecuritySettingsPage.test.tsx` — the reference
  screen, including that no specification code reaches the page.


## Admin-wide sweep — 12 September 2026 (workstream I)

The whole admin was read against the brief's rules rather than screen by screen.
What the sweep found, and what was done:

1. **Two renderings of the same activity codes.** The dashboard and the activity
   log each turned `auth.login.success` into English their own way, so the same
   event read differently depending on where you saw it. Both now call
   `shared/activity.ts`; a code with no entry falls back to its own words rather
   than to an invented meaning.
2. **Raw stored values on the abuse-reports queue.** The reported item's state
   and the resolution outcome were printed as the words the database holds
   (`retain`, `approved`). They now use the shared status vocabulary and the
   same list the outcome was chosen from.
3. **Ant's own palette in three places** (`<Tag color="blue">`, two hard-coded
   greys). Those colours ignore the admin's theme tokens, so they stayed bright
   in the dark theme. Replaced with `Pill` and `brand.*`.
4. **Nine visible text inputs had no placeholder** — a rule the rest of the
   admin already followed. Each now carries an example, never a repeat of its
   label.
5. **Blog categories and tags never showed their public address**, although both
   have a public landing page and the API has always accepted a slug. The
   address row is now there, as it is for a listing or an article.
6. **Moving a blog category or tag left no redirect** (SRS SEO 004). The API
   accepted the rename and produced a dead public URL, with saved links and
   search results pointing at nothing — the same defect already fixed for
   categories and local areas. It now writes a permanent redirect inside the
   rename's transaction, so a failed redirect takes the rename back with it.
7. **The page editor had no unsaved-changes guard**, though its body is the
   longest thing anyone types in this admin. Added, along with the two settings
   screens and the role editor, which had a `beforeunload` that never saw a
   click on a navigation item.
8. **Every image field is now the same control.** General settings kept three
   hand-rolled pickers; they are `MediaField` like everywhere else. The picker
   dialog also mounts only when it is opened — a screen with several image
   fields was carrying one hidden dialog per field.
9. **Home-page banner focal points were two numbers between 0 and 1.** Nobody
   can picture 0.42, 0.31; the visual picker the media screen already had is now
   used here too.

The two previews that were left outstanding — the home-page hero and the placed
listing on a featured placement — were built afterwards. Both are likenesses
drawn inside the admin rather than the public components imported: the admin is
Ant Design and the site is Tailwind. Each says on screen what it does not
reproduce (typeface, rotation, live counts), is `aria-hidden` so the form is not
read twice, and never animates inside the editor.
