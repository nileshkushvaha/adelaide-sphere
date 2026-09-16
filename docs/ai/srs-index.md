# SRS navigation index

Index into `docs/Adelaide_Sphere_Technical_SRS_v1.md` (919 lines, MD5 `7bf0464e568dbe237fc5a5d1eb748c2e` on 2026-09-16 after the city-name update; SRS revision 1.17; heading positions unchanged). It maps implementation areas to the SRS's own headings and requirement IDs so a session reads the complete relevant sections instead of the whole document. It is not a specification: when in doubt, open the section. Line numbers are approximate anchors for `sed -n`; headings are exact.

| Area | SRS heading (exact) | IDs | Approx. lines |
| --- | --- | --- | --- |
| Governance, precedence, actors | `# 1 Scope and requirement governance` (`## Mandatory scope`, `## Interpretation and precedence`, `## Actors and responsibility`) | SCP 001–005 | 80–108 |
| Adelaide geographic scope | `# 1 Scope and requirement governance` (SCP 001–005) and `# 6 Business listings and local areas` (BUS 008) | SCP, BUS 008 | 80–108, 204–223 |
| Public experience, branding, routes | `# 2 Reference and public experience` (`## Reference interpretation`, `## Public route contract`) | UX 001–003 | 109–139 |
| Architecture, repository, boundaries | `# 3 Agreed architecture and repository` | ARC 001–005 | 140–165 |
| Hero banner and search box | `# 4 Hero banner and search interaction` | HERO 001–007 | 166–183 |
| Directory search, filters, sort, pagination | `# 5 Directory search and discovery` | DIR 001–008 | 184–203 |
| Business listings, hours, publication, duplicates | `# 6 Business listings and local areas` | BUS 001–008 | 204–223 |
| Reviews, ratings, abuse reports, moderation | `# 7 Ratings reviews and abuse reporting` | REV 001–005, REP 001–002 | 224–241 |
| Enquiries and contact handling | `# 8 Business enquiries and contact handling` | ENQ 001–007 | 242–259 |
| Blog, editorial, comments | `# 9 Blog and editorial content` | BLOG 001–005 (006 in the 1.10 change log), COM 001–002 | 260–277 |
| Admin auth, accounts, admin UX | `# 10 Administration and permissions` | ADM 001–003, AUTH 001–003 | 278–317 |
| **Roles, permissions, effective access, permission-aware admin UI** | `# 10 Administration and permissions` (RBAC block, revision 1.1) | RBAC 001–012 | 278–317 |
| Media pipeline and site configuration/pages (page sections, preview, history, scheduling and address changes: change log 1.17) | `# 11 Media and site configuration` | MED 001–004, CFG 001–003 | 318–335 |
| SEO, sitemap, redirects, structured data | `# 12 SEO indexing and structured data` | SEO 001–007 | 336–353 |
| Core data model and invariants (entity table) | `# 13 Data model and relational invariants` | DAT 001–003 | 354–375 |
| Editorial/operational model, migrations | `# 14 Editorial and operational data model` | DAT 004–006 | 376–406 |
| Public REST contract (route table), envelopes, idempotency | `# 15 REST contract and public API` | API 001–004 | 407–435 |
| Admin API, versioning, module ownership | `# 16 Admin API and module ownership` | API 005, MOD 001–002 | 436–469 |
| Events, outbox, caching, invalidation | `# 17 Events caching and consistency` | EVT 001–002, CACHE 001–003 | 470–491 |
| Security, privacy, retention | `# 18 Security privacy and retention` | SEC 001–004, PRIV 001–002 | 492–514 |
| Performance, accessibility, responsive, compatibility (NFR table + rules) | `# 19 Non functional requirements` | NFR 001–013 | 515–537 |
| Deployment, backups, monitoring | `# 20 Deployment backups and monitoring` | OPS 001–004, BACK 001–002, MON 001–002 | 538–555 |
| Verification and acceptance matrix (T01–T14) | `# 21 Verification and acceptance matrix` | QA 001–003 | 556–581 |
| Implementation sequence and release gates | `# 22 Implementation sequence and release gates` | — | 582–606 |
| Client decisions D01–D08, risks, future scope | `# 23 Decisions risks and future scope` (`## Launch decision register`, `## Principal risks and controls`, `## Explicit future scope`) | FUT 001–004 | 607–637 |
| Sources and audit handover checklist | `# 24 Source register and audit handover` | — | 638–670 |
| **Shared settings architecture (typed groups, secrets, versioned change)** | `# 25 Operational administration modules` (`## Shared settings architecture`) | SET 001–005 | 698–713 |
| **Transactional email: Resend provider, delivery records, webhooks, resend** | `# 25 Operational administration modules` (`## Transactional email provider and delivery records`) | MAIL 001–010 | 714–735 |
| **Activity log (consolidated, append-only, retention)** | `# 25 Operational administration modules` (`## Activity log`) | ACT 001–006 | 736–749 |
| **Security settings (authentication, password policy, login, session)** | `# 25 Operational administration modules` (`## Security settings`) | SECS 001–008 | 750–767 |
| **Cache manager (registered namespaces, prohibited capabilities)** | `# 25 Operational administration modules` (`## Cache manager`) | CMGR 001–005 | 768–779 |
| **Queue monitor (BullMQ surfaces, redaction, bounded actions)** | `# 25 Operational administration modules` (`## Queue monitor`) | QMON 001–005 | 780–791 |
| **Scheduled tasks (code registry, locking, run now)** | `# 25 Operational administration modules` (`## Scheduled tasks`) | TASK 001–006 | 792–805 |
| **Permission catalogue for the new modules** | `# 25 Operational administration modules` (`## Permissions for the operational modules`) | RBAC 013 | 806–811 |
| **Navigation menus (WordPress-style menus, locations, link safety, public rendering)** | `# 26 Website content modules` (`## Navigation menus`); UX 002 amended in 1.9 | MENU 001–006, UX 002 | 894–908 |
| **About page** | `# 26 Website content modules` (`## About page`) | ABT 001–006 | 821–833 |
| **FAQs** | `# 26 Website content modules` (`## Frequently asked questions`) | FAQ 001–005 | 835–846 |
| **Service alerts above the public header** | `# 26 Website content modules` (`## Service alerts`) | ALRT 001–007 | 847–862 |
| **Testimonials** | `# 26 Website content modules` (`## Testimonials`) | TSTM 001–005 | 863–874 |
| **Client/partner logos** | `# 26 Website content modules` (`## Client and partner logos`) | PTNR 001–005 | 875–888 |

Per-phase acceptance criteria are written in `docs/setup-progress.md` from these sections; the requirement-level status lives in `docs/requirements-traceability.md`.

Sections 25–26 were added at revision 1.2 and extend the earlier sections; the obligations of sections 10, 16, 17, 18 and 19 apply to every module specified there. The Logimart reference comparison that informed them is `docs/reference/logimart-comparison.md` — a behavioural reference only, never an architecture or security reference.

Line ranges after the change-log table are approximate: rows 1.13–1.17 (15 Sep 2026) lengthened the table near the top of the file, so sections sit roughly 5–10 lines lower than the ranges shown. Search for the exact heading.
