# Hero photography — sources, licences and attribution

The homepage banner (SRS HERO 001) shows Adelaide photography. Administrators can
configure the banner in site settings; whatever they configure replaces this set.
Until the client supplies its own commissioned or licensed photography, the site
ships the two images below so the hero is a real destination banner rather than a
flat colour panel.

Both are **Creative Commons Attribution-ShareAlike** images: attribution and the licence name are required, and the cropped files are shared under the same licence. Non-commercial and no-derivatives candidates were rejected. Files are stored locally in
`apps/web/public/hero/` (never hot-linked), cropped to 2560×1440, re-encoded as
WebP at quality 76 with EXIF removed, and served through the Next.js image
optimiser with responsive `sizes`.

The credit below is rendered with the banner (`caption` in
`apps/web/src/lib/hero-assets.ts`), which is where the licence's attribution
requirement is satisfied.

These two files are the **fallback only**: the site shows them when no Home
banner slide is configured. They are not in the media library.

## The configured banner (database)

The banner the home page shows comes from the Home banner slides in Configuration → Home page settings, stored in the `website/home` settings document. The Adelaide database has no configured slides, so the two fallback images below are what the home page shows. (The Melbourne project seeded five Melbourne slides with `apps/api/scripts/seed-hero-slides.ts`; that script has not been run here.)

| File | Subject | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| `adelaide-river-torrens.webp` | The city skyline and Festival Centre reflected in the River Torrens | Yu Chu Chin | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons: "Adelaide CBD skyline across the River Torrens, July 2026 (028A8462)"](https://commons.wikimedia.org/wiki/File:Adelaide_CBD_skyline_across_the_River_Torrens,_July_2026_(028A8462).jpg) |
| `adelaide-oval-footbridge.webp` | The Adelaide Oval footbridge lit at night | Luke Anderson | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | [Wikimedia Commons: "Adelaide Oval Footbridge"](https://commons.wikimedia.org/wiki/File:Adelaide_Oval_Footbridge.jpg) |

Both replace the Melbourne fallback images on 15 September 2026 (user approval of the downloads, same day). Crops: the skyline keeps the full Deloitte tower and the reflections (16:9 from the 3:2 original); the footbridge trims both edges evenly to keep the bridge pylon and the Oval.

## Where else these images are used

Nowhere else. The About page carries its own photographs, recorded in
`about-photography.md`.

## When the client supplies its own photography

1. Upload the images through the admin media library and configure them as hero
   slides with per-image focal points and alt text — no code change is needed.
2. Once the client's set is complete, delete the two files above and the
   `DEFAULT_HERO_SLIDES` entries, or leave them as the fallback if the client is
   happy for them to appear when no slide is configured.

Brand assets (logotype, wordmark, favicon set) and approved hero photography
remain open client-supplied content; they are listed in
`docs/pre-audit-report.md` §4.
