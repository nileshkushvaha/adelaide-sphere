<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Authorization (SRS RBAC 001–012)

`src/authorization/` owns access control: the effective-permission resolver (`roles ∪ direct`, active only, cached in Redis under an authorization version that every change increments), the CASL ability factory the default-deny guard decides with, and the access administration API (`/admin/roles`, `/admin/permissions`, `/admin/admins/{id}/access|roles|permissions`).

- Declare a permission on every admin route: `@RequirePermissions('listings.publish')`. A route that declares nothing is refused and logged — nothing ships open.
- Permission codes live in `src/identity/permissions.ts` and are synchronised by `pnpm --filter api admin:seed-rbac` (idempotent; run it after every permission change and on deployment). Codes outside the catalogue can never satisfy a requirement.
- 401 for missing/invalid authentication, 403 for a valid identity without the permission; neither says which permission was missing.
- Access changes are transactional with their `authz.*` audit record and their cache invalidation. Editing the tables directly does not signal a change: bump `admin_users.authzVersion` the way the API does.

Model, invariants, recipes and the recovery procedure: `docs/authorization.md`. Technology decision: `docs/decisions/0001-authorization-casl.md`.

## Navigation menus (SRS 1.9 MENU 001–006)

`src/website/menu*.ts`. A menu is saved as a whole tree (`PUT /admin/menus/:id` with `expectedVersion`, items flat in display order, parents first) in one transaction with its activity record and, when the menu is shown anywhere, a `menus` cache purge. Locations are fixed rows (`PUT /admin/menus/locations/:location`); a save or assignment is checked against the shared rules in `@adelaide-sphere/domain/menus`, and every referenced record must exist. `GET /admin/menus/link-sources` feeds the admin's content panels under the menu permission alone. `GET /site/menus` resolves addresses and hides unpublished, inactive or deleted targets with their children (`menu-resolver.ts`, pure and unit tested).

Deployment order: `migrate deploy` → `admin:seed-rbac` → `menus:seed` → `media:backfill-content` (records images already inside stored article, page, bio, FAQ and landing text so the media library and the retention task treat them as in use; `--dry-run` reports images that were already lost) → `blog:backfill-search-text` (fills `posts.searchText` for articles saved before blog search, SRS 1.10 BLOG 005; idempotent, `--dry-run` reports how many would change). The seed creates the default Main navigation, Footer and Footer legal menus only where a location is still empty, so it is safe to re-run; until it runs, the public header falls back to its built-in product routes.


## Integration test isolation

`test:integration` runs the real application against the real local MySQL and Redis, one file at a time (`fileParallelism: false`). Two rules keep it deterministic:

- **One HTTP port per file.** `createIntegrationApp` (and the bespoke bootstrap in `auth.integration-spec.ts`) bind the server once through `listenForTests`. supertest otherwise calls `server.listen(0)` for *every* request and closes it afterwards; across a full suite that is thousands of bind/close cycles, and an ephemeral port reused while its predecessor is still in `TIME_WAIT` lets a client read the previous connection's response. That produced the 2026-09-07 order-dependent failures — a public route answering `401`, a `403` assertion receiving `401`, and `Parse Error: Expected HTTP/, RTSP/ or ICE/`.
- **A real budget for the truncation transaction.** `truncateApplicationTables` empties more than fifty tables inside one interactive transaction so `FOREIGN_KEY_CHECKS = 0` applies to all of them. Prisma's default 5 s timeout can expire mid-loop on a loaded machine and break the suite's `beforeAll`, so the timeout is set explicitly.

After a run that exercised authentication, `pnpm --filter api auth:artifacts:check` confirms no reset link or session survived.

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
