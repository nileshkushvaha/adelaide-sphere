# @adelaide-sphere/ui

Public design system for `apps/web` (SRS ARC 001 table, UX 001): Tailwind v4 design tokens (`src/styles.css`, sky-blue/navy palette, light/dark surfaces, focus ring, reduced-motion rule) and shadcn-style React primitives built with `class-variance-authority`, `clsx`, `tailwind-merge` and `@radix-ui/react-slot` (`Button` with `asChild`, `Card*`, `Badge`, `Input`, `Select`, `Label`, `Chip`).

- Source-only package: consumers compile it (Next.js transpiles workspace packages) and Tailwind scans it via `@source` in the app CSS.
- No Ant Design, Refine or backend imports (SRS NFR 013): the public bundle stays free of admin code.
- Components are plain server-compatible React; none use hooks, so they render in React Server Components.

Commands: `pnpm --filter @adelaide-sphere/ui typecheck` / `lint`.
