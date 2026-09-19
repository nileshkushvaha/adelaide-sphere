# AI content admin UI refresh

19 September 2026. Presentation changes only; existing provider work in the working tree was preserved.

## Route review

| Route | Improvement |
| --- | --- |
| `/ai-content` | Six live summary cards, links to filtered queues, complete status breakdown, workspace state and separate text/image budget meters. |
| `/ai-content/topics` | URL-backed status filters, readable status pills, collapsible manual-topic form and named confirmation actions. |
| `/ai-content/topics/:id` | Topic title as the page heading, stage links, semantic section headings, compact metadata and shared evidence/image/run statuses. |
| `/ai-content/fact-review` | Dedicated evidence-decision queue without manual-topic creation. |
| `/ai-content/sources` | Website terminology, collapsible creation form, source-update feedback and controls locked during updates. |
| `/ai-content/pricing` | Collapsible proposals, explicit approval wording, precise fractional pricing and consistent status labels. |
| `/ai-content/schedule` | Daily research-window terminology and shared status pills. |
| `/ai-content/settings` | Seven settings groups, responsive fields, sticky save/unsaved state, unavailable modes disabled, currency amounts mapped back to integer minor units. |

All routes share `AiWorkspace` navigation and scoped CSS using the admin theme variables. Restricted links follow existing permissions. Image comparisons prevent changing or dismissing an in-flight request and explain the bounded selection.

## Verification and limits

- Admin `typecheck` and `lint`: passed.
- Existing interaction assertions adapted; **no test suite executed** for this task.
- Signed-in Chrome: overview and existing topic detail rendered with live data, including budget meters and review-stage navigation.
- Full authenticated route sweep, mobile widths and dark-theme screenshots: not completed. The separate browser session required sign-in; the native Chrome screenshot API was unavailable. Responsive styles and palette bindings were checked in source, not certified by screenshots.
- No settings submitted, new content created, paid/provider calls, database changes, deployment, commit or push.

Changes are limited to admin presentation/components/routes and these documentation records. Currency inputs preserve the API's minor-unit representation, existing bounds and version checks. The server remains the authority for cost, review and publication decisions.
