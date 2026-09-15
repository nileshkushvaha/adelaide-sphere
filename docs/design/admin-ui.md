# Admin interface design

**Status:** 10 September 2026. The system every admin screen is built from, and
the rules a new screen has to follow to look like it belongs.

The admin is an internal product for people who run the directory all day. It
should feel calm, dense enough to work in, and honest about what an action does.
It is not a marketing surface: no oversized headings, no decorative gradients, no
charts without data behind them.

## Tokens

Everything visual comes from `apps/admin/src/config/theme.ts`. A screen that
hard-codes a colour is a bug — the token is the contract.

| Group | Token | Value | Used for |
| --- | --- | --- | --- |
| Brand | `primary` | `#0369A1` | primary buttons, links, selected states |
| | `primarySoft` | `#E0F2FE` | tinted badges and progress states |
| Navigation | `navy` | `#0B1F3A` | the sidebar |
| | `navyRaised` | `#132B4C` | hovered and active rail surfaces |
| Surfaces | `surface` | `#F4F7FB` | the page ground |
| | `surfaceRaised` | `#FFFFFF` | cards |
| | `surfaceMuted` | `#F8FAFC` | table headers, inset summaries |
| Lines | `border` / `borderStrong` | `#E2E8F0` / `#CBD5E1` | card edges, table rules |
| Text | `text` / `textMuted` / `textSubtle` | `#0F172A` / `#475569` / `#64748B` | body, help, labels |
| Status | `success` `warning` `danger` | | one meaning each, never decorative |
| Focus | `focus` | `#B45309` | the focus ring, on every interactive element |

Type is Manrope, matching the public site. Headings are compact: page titles
28/30 px, section headings 16 px, body 14 px, help 13 px. Nothing smaller than
12 px, and nothing under 4.5:1 contrast.

Spacing is an 8 px rhythm: 8, 12, 16, 20, 24, 32. Cards use a 12 px radius, a
single hairline border and one soft shadow; controls are 36 px tall (32 px when
`size="small"`).

## Themes

Light is the default; dark is a per-browser choice from the sun/moon button in
the top bar (stored under `ms.admin.theme`; a refused store just means light).

* **One source.** `src/config/theme.ts` holds a light and a dark palette with the
  same keys. Ant Design gets real colours from the active palette (its dark
  algorithm needs them); everything else uses `brand.*`, which are CSS variables
  (`var(--ms-text)`) written onto the document by `applyThemeVariables`. Never
  hard-code a hex value in a component — add a palette key instead.
* **Fixed on purpose:** the navy navigation, `primarySolid` (fills that carry
  white text), the search-result preview (imitates a light results page), and
  the QR code's white ground.
* **Gradients:** the page ground (sky, indigo and teal glows), the navigation
  rail and its selected item, cards (top to bottom), page titles, stat icons and
  every primary button share one brand gradient, `#075985 → #0369A1 → #0E7490`.
* **Contrast is tested for both palettes** (`theme.test.ts`), including text on
  every surface and tinted row, both ends of the title gradient, and the focus
  ring; the browser suite runs axe in the dark theme as well.

## Sign-in screens

`AuthScreen` frames sign-in, the code step, forgotten password, reset and
setup: a lit navy ground, the form on a frosted-glass card that follows the
theme. Failures are answered by kind (`auth/sign-in-failure.ts`): wrong details
never say which half was wrong, a rate limit counts down on the button, an
unreachable server is named as such. A reset or setup link sends the reader
straight to sign in with a notice (`auth/sign-in-notice.ts`); only notices
defined there are ever shown. Both link screens use `NewPasswordForm`.

## Helper text

A page or section description fits on one line (at most 110 characters); a
field hint is shorter (at most 90). Say what the reader needs to act, not how
the system works. `src/copy-length.test.ts` fails on anything longer.

## Page structure

Every screen is assembled in this order. A screen that needs none of the optional
parts still keeps the order.

1. **Breadcrumbs** — only when the screen sits inside something (`Security /
   Security settings`). A top-level list does not need them.
2. **Page title** — the noun the administrator came for.
3. **Description** — one sentence, plain language, what this screen is for.
4. **Primary action** — top right, one per screen.
5. **Status or warning** — only when there is something to say.
6. **Filters, summary or navigation**.
7. **Content**.
8. **Contextual help** where a decision needs it.

## Components

| Component | Use it for |
| --- | --- |
| `PageHeader` | 1–5 above, on every screen |
| `SectionCard` | a titled group inside a page |
| `SettingsSection` | a group of settings, with a summary of what they mean |
| `TableCard` | a list: its own toolbar, table and footer in one card |
| `StatCard` | one real number, linked to where it came from |
| `StatusTag` | any state; the shared vocabulary lives here |
| `StickyActions` | save/discard on any form longer than a screen |
| `EmptyState` | an empty list, with the next step |
| `ErrorState` | a failed load, with a retry and a reference |
| `PermissionDenied` | a screen or section the administrator may not see |
| `DangerZone` | irreversible actions, kept away from the save path |
| `RecordMetadata` | who changed a record and when |
| `PageLoader` | a load in progress |
| `RecordEditorPage` | the create/edit shell: load, save, conflict, not-found, unsaved-changes guard; its side column stacks under the form below `lg` |
| `FormSelect` | a `Select` inside a **required** `Form.Item` — keeps `aria-required` on the combobox, where Ant also puts it on a role-less wrapper |
| `expandToggle(describe)` | a table's `expandable.expandIcon` — a named button with `aria-expanded`, instead of Ant's nameless one |
| `FocalPointPicker` | the part of an image that must stay in frame; click or arrow keys |
| `PermissionMatrix` | choosing permissions; `annotate` explains or withholds an entry (the access editor withholds what the actor does not hold) |
| `ServiceAlertPreview` | a picture of the public alert banner, drawn from `@adelaide-sphere/domain/alerts`; `aria-hidden`, with its announcement described in words |

Reuse these. A screen that invents its own card, its own empty state or its own
status colour is the thing this system exists to prevent.

## Writing

Copy is part of the interface. The rules:

* **Short, specific, professional.** Say what the thing is or what the action
  will do.
* **No internal codes.** `AUTH 002`, `SECS 006`, `RBAC 010` are ours, not the
  reader's. They belong in code comments, tests and `docs/`.
* **No implementation detail.** No framework names, table names, endpoint paths,
  driver error codes, or words like *payload*, *envelope*, *rendition*.
* **Units, always.** A number without a unit is a puzzle. `30` becomes `30
  minutes` through an input suffix.
* **Limits in plain language.** "For security, this cannot be longer than 30
  minutes" — not "bounded by AUTH 002".
* **Honest about what is missing.** If a control is not enforced by the server,
  do not draw it. Say what is available instead.
* **Consequence before confirmation.** A dialog names the action, the record, what
  happens immediately, whether anyone is signed out, and whether it can be undone.
* **Buttons say what they do.** `Save security settings`, `Delete role`,
  `Sign it out` — never `OK`, `Submit` or `Yes`.

### Status vocabulary

One word per state, one tone per word, everywhere: `published`, `draft`,
`scheduled`, `archived`, `pending`, `approved`, `rejected`, `failed`,
`delivered`, `running`, `stopped`, `behind`, `on schedule`, `connected`.
Add a new word to `StatusTag`, never to a page.

## Responsive rules

Breakpoints follow Ant Design: `xs` <576, `sm` ≥576, `md` ≥768, `lg` ≥992,
`xl` ≥1200, `xxl` ≥1600.

* The sidebar is fixed at `lg` and above, a drawer below it.
* Settings and forms are two columns at `lg`, one below.
* Tables scroll inside their own card (`className="ms-scroll-table"` plus
  `scroll={{ x: … }}`); the page never scrolls sideways.
* A row of short fields uses `ms-field-row`, not `Space`: a `Space` item sizes to
  its content, so a 300 px field in one cannot shrink on a 320 px screen. Give
  each `Form.Item` its preferred width and let the row cap it.
* Fixed grid columns (`110px 170px 1fr`) need a narrow-screen form in the
  stylesheet; an inline `gridTemplateColumns` cannot change at a breakpoint.
* Sticky action bars sit above the content, never over the last field.
* Touch targets stay at least 40 px on coarse pointers.

Accepted at 1440, 1280, 1024, 768, 390 and 320 px, and at 200% zoom.
`e2e/specs/admin-ui.spec.ts` asserts the overflow rule at every one of those
widths for one screen of each family.

## Accessibility

WCAG 2.2 AA is a delivery obligation, not a polish pass.

* One `h1` per screen, sections as `h2`, no skipped levels.
* Landmarks: `banner`, `navigation` (named), `main`, `contentinfo`, and a skip
  link.
* Every input has a real `<label>`; errors are associated with their field.
* Status is never colour alone — the word carries it, the dot repeats it.
* Dialogs trap focus and return it; Escape closes drawers and dialogs.
* Icon-only buttons carry an accessible name; repeated group buttons name their
  group (`Select all in Editorial`).
* `prefers-reduced-motion` removes transitions.

* Text, including placeholders, meets 4.5:1. The theme sets
  `colorTextPlaceholder` for that reason; Ant's preset tag colours are darkened
  in `global.css`, and status is shown with `StatusTag` rather than a preset.
* A preview of something that announces itself (an alert banner) is
  `aria-hidden` and describes its behaviour in text, or it would announce on
  every keystroke.

`e2e/specs/admin-ui.spec.ts` runs axe over one screen of each family, and
`e2e/scripts/route-sweep.ts` over every route (see the inventory).

## Permission-aware UI

The interface never authorises anything; the API does. The rules here are about
not lying to the administrator:

* Hide an action the administrator cannot perform, rather than showing a control
  that will be refused.
* Show nothing at all until capabilities have loaded — a menu that appears and
  then loses half its entries reads as a fault.
* When a whole screen needs a permission the administrator lacks, say which
  access is missing (`PermissionDenied`).
* Never render data the API would not return.

## Open client decisions that affect this interface

* **D06 — mandatory two-factor.** Two-factor is per-administrator today. The
  security screen states that, and deliberately shows no switch for a policy the
  server cannot yet enforce.
* **D07 — on-call responder.** Alert routing is documented but unassigned, so no
  screen claims someone is being paged.
* **D05 / D10 — approved copy, testimonials, partner logos and photography.**
  Publication gates refuse incomplete records; nothing is invented to fill them.
