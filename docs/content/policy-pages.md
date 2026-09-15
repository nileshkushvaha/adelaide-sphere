# Policy pages — where the wording came from

The three policy pages (`/privacy`, `/terms`, `/review-guidelines`) carry
baseline wording written for this project and seeded by
`apps/api/scripts/seed-website-content.ts` from
`apps/api/scripts/policy-page-content.ts`.

## Why a script wrote them at all

`apps/api/src/cli/seed-pages.ts` records the rule that policy pages carry the
client's own approved wording and that no script may invent it. That rule
stands for wording a script would make up. This text is different in two ways,
and was written at the client's explicit request on 13 September 2026:

* It **describes what this system actually does** — what it stores, what it
  encrypts, how long each kind of record is kept, how a review is moderated,
  what happens when a review is edited. Every statement in it is checkable
  against the code, and the specifics were read out of the code rather than
  assumed. The retention periods, for instance, come from
  `packages/domain/src/scheduled-tasks.ts`; the encryption claims from the
  four call sites of `FieldEncryptionService.encrypt`.
* It is a **starting point, not final legal text**.

## What still needs doing before launch

**The privacy policy and the terms of use state obligations, and a lawyer
should read them before the site goes live.** They were written to be accurate
and plain rather than to be legally complete: they do not name a legal entity,
they do not set a governing jurisdiction beyond referring to Australian
Consumer Law, and they make no attempt at the disclosures a particular
regulator may require.

The review guidelines are the site's own moderation rules rather than a legal
document, and are accurate as written.

## Changing them

Edit them in the admin, at Website → Pages. The seeder writes a page **only
when it is empty**, so once an editor has touched a page the script leaves it
alone permanently — re-running it after a rewrite will not undo the rewrite.
