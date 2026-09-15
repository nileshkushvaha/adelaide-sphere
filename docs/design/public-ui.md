# Melbourne Sphere public UI direction

Status: active design foundation, homepage applied first. The SRS remains authoritative.

## Brand character

Melbourne Sphere should feel like a premium local discovery publication: assured, contemporary, useful and distinctly Melbourne. The interface combines wide editorial composition with restrained glass information panels. Glass is an emphasis tool, not a default card style.

## Palette

- Ink navy `#061821`: hero, footer and highest-contrast bands.
- Deep cobalt `#0d2848`: dark feature bands.
- Blue `#199ed8` and clear sky `#5ec8f2`: discovery accents and actions.
- Cool white `#f7f9fc`: editorial page background.
- Mist blue `#edf3f8`: alternating data/discovery band.
- Ink text `#13243a`: primary text on light surfaces.
- Muted steel is used for secondary detail; warm accent gradients are intentionally excluded for a more professional identity.

Canonical values live in `packages/ui/src/styles.css`; this document explains intent rather than duplicating every token.

## Typography

- Manrope: navigation, body, forms and metadata.
- Sora: hero, major headings, statistics and high-value calls to action.
- Use compact display leading, readable body measure and strong size contrast. Avoid decorative serif faces and tiny dashboard-like labels.

Both families are supplied through `next/font`, so font files are self-hosted by Next.js.

## Composition

- Full-bleed sections with the shared 1520 px content container and responsive gutters.
- Alternate warm light, cool light and deep dark bands.
- Keep paragraphs within a readable measure even when the composition is wide.
- Use asymmetric desktop layouts when imagery or editorial content benefits from them.

## Glass and information graphics

- `.ms-glass-light`: hero search and high-value light overlays.
- `.ms-glass-dark`: locality, trust and operational information over dark bands.
- `.ms-dot-grid`: low-contrast infographic texture for data/discovery bands.
- Blur is progressive enhancement. Every glass surface has an opaque fallback and a visible border.
- Do not use glass for long reading surfaces, every card, or form error messages.

## Accessibility

WCAG 2.2 AA remains mandatory. Palette tests cover text, links and focus contrast. Motion honors reduced-motion settings; rotating hero content has pause controls and reserves space to avoid layout shift.

## Applied routes

- **Home** — establishes the system: hero, alternating bands, glass discovery cards.
- **About** (`/about`) — the first content route on the system. It reuses `Band`,
  `SectionHeading` and the glass tokens rather than introducing a second visual
  language, and adds three components of its own under
  `apps/web/src/components/about/`: a compact photographic hero (360–440 px on
  desktop, measured 380 px at 1440 px and 402 px at 1024 px), a dark glass
  metrics band whose figures are counted live and omitted when they cannot be
  stated truthfully, and a process track that is a horizontal five-step row on
  desktop, a vertical list on mobile, and an ordered list in both. Section rhythm
  is light → dark → soft → light → deep → page → soft → dark, so no two adjacent
  bands share a surface. Section 5 uses `.ms-dot-grid` over the deep band for the
  Melbourne composition; no map embed, no parallax, no client JavaScript.

## Rollout

The homepage establishes the system. About is migrated. Directory, business detail, blog, article and the remaining content and contact pages should follow one route family at a time, retaining URL, SEO, data, empty, error and permission behavior. Each route requires desktop, tablet and mobile inspection before acceptance.
