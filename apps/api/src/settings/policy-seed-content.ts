/**
 * Baseline wording for the three policy pages (SRS CFG 002).
 *
 * This is shipped product copy, written at the client's explicit request (13
 * September 2026) and installed by `pnpm --filter api pages:seed` into a page
 * that does not exist yet. The rule it sits beside — that no script may invent
 * a policy — still holds: this text is different in two ways:
 *
 *  * it describes what this system actually does — what it stores, what it
 *    encrypts, how long it keeps things, how a review is moderated — all of
 *    which is verifiable in the code rather than imagined; and
 *  * it is a starting point for the client's own review, not final legal text.
 *    The privacy and terms pages state obligations, and a lawyer should read
 *    them before launch. That is recorded in
 *    `docs/content/policy-pages.md`.
 *
 * The seeder writes a page only when it is empty, so an editor's own wording
 * is never replaced.
 */

export interface SeedPolicyPage {
  slug: string;
  title: string;
  /** Markdown, rendered through the same sanitiser an editor's copy goes through. */
  body: string;
}


export const SEED_POLICY_PAGES: SeedPolicyPage[] = [
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    body: `Adelaide Sphere is a directory of Adelaide businesses. This page explains what personal information the site collects, why, how long it is kept and how to have it removed. It describes what the site actually does rather than what it reserves the right to do.

## What we collect, and when

We collect information only when you choose to send it.

**When you send an enquiry to a business**, we collect your name, your email address and, if you give one, your phone number, along with your message. We pass the message to the business so it can reply to you.

**When you write a review or a comment**, we collect the display name you choose, your email address and what you wrote.

**When you contact the editors**, we collect whatever you put in the form or the email.

We do not ask you to create an account, and there is nothing to log in to. We do not buy personal information about you from anyone else, and we do not build a profile of you.

## What we do with it

Your email address is used to contact you about the thing you sent — a question about your review, or a failed delivery of your enquiry. It is not used for marketing, it is not sold, and it is not passed to anyone other than the business you deliberately wrote to.

Your email address is never published. A review shows the display name you chose and nothing else.

## How it is stored

Contact details you send us — the email address on a review or comment, and the email address and phone number on an enquiry — are encrypted before they are stored, and are decrypted only when somebody with the right permission deliberately asks to see one. Each time that happens it is recorded in our activity log.

We do not store your IP address alongside what you wrote. We store a one-way keyed hash of it, which lets us recognise repeated abuse from the same source without keeping the address itself.

## How long we keep it

* **Reviews and comments** are kept while they are published. If one is removed, the record of the decision is kept so we can explain it.
* **Enquiries** are kept so the business and our editors can follow up a delivery that failed.
* **Email delivery records** have the recipient removed after 90 days, and the record itself is deleted 180 days after its last event.
* **Our activity log**, which records what administrators did, is kept for 365 days.
* **Images** that are uploaded and never used anywhere are deleted after 30 days.

## Cookies and analytics

Nothing that tracks you loads until you choose to accept it. The banner asks once; if you decline, or ignore it, no analytics or advertising scripts are loaded at all and the site works exactly the same. You can change your answer at any time from the link at the foot of every page.

The site sets one cookie to remember that answer, and — for administrators only — a session cookie for signing in. Neither is used to track you across other sites.

## Asking to see or delete your information

Write to the editors through the contact page and tell us what you would like. We will tell you what we hold, remove what we can, and say plainly if something has to be kept and why. You do not have to give a reason.

## Changes to this page

If this policy changes in a way that affects what we do with information already collected, we will say so on this page and date the change.`,
  },
  {
    slug: 'terms',
    title: 'Terms of Use',
    body: `These terms apply to everyone who uses Adelaide Sphere. Using the site means accepting them.

## What this site is

Adelaide Sphere is an independent directory of businesses operating in Adelaide, South Australia, together with guides written by our editors. It is not affiliated with the businesses it lists, and being listed is not an endorsement.

## About the listings

Listing details — opening hours, contact details, the description of what a business does — are supplied by the businesses themselves and checked by our editors before publication. Businesses change, and a check made once can go out of date. Please confirm anything that matters to you with the business directly before travelling or spending money.

Businesses pay a yearly fee to be listed, and guest posts on the blog are paid for and clearly labelled as guest posts. No business can pay to rank higher in search results. Featured placements appear in a separate, labelled block and never change the order of the results themselves.

If you find something on a listing that is wrong, tell us and we will correct it.

## Reviews, comments and other contributions

When you write a review or a comment you confirm that it describes your own experience and that you have the right to publish what you wrote.

Everything is read by a moderator before it appears. We will refuse or remove a contribution that names an individual, contains somebody's personal information, advertises something, describes an experience that is not yours, or is abusive. The Review Guidelines set this out in full.

You keep ownership of what you write. By submitting it you give us permission to publish it on this site, and to edit it for length or to remove a personal detail — where we do edit, the page says so.

## Acceptable use

Do not use this site to harvest contact details, to send unsolicited messages to the businesses listed, to attempt to gain access to any part of it you are not meant to reach, or to interfere with its operation. Automated collection of the directory is not permitted.

## Our own content

The guides, category and area descriptions, and the design of the site belong to us. You are welcome to link to any page. Republishing substantial parts of the site requires our permission.

## Availability and liability

We work to keep the site available and accurate, but we do not guarantee either. To the extent the law allows, we are not liable for loss arising from your use of the site or from dealings with a business you found through it — those dealings are between you and the business. Nothing here limits rights you have under the Australian Consumer Law.

## Changes

We may change these terms. Material changes will be noted on this page with the date they took effect.

## Getting in touch

Questions about these terms go to the editors through the contact page.`,
  },
  {
    slug: 'review-guidelines',
    title: 'Review Guidelines',
    body: `Reviews are the most useful thing on a listing, and the easiest to get wrong. These are the rules we apply, and they are the same for everyone.

## Write about your own experience

A review should describe something that happened to you at that business. Not what you heard, not what happened to a friend, and not an opinion about the industry in general.

## Do not name individuals

Describe the service, not the person who gave it. A named staff member cannot answer back, and a bad day at work should not follow somebody around online. "The person on the counter was unhelpful" is fine; a name is not.

## Leave personal information out

Do not include anybody's phone number, email address, home address, order number or any other detail that identifies a person — yours included. We will remove them.

## No advertising

A review is not a place to promote another business, post a link, or run a competitor down. We remove these without exception.

## Be fair

Strong criticism is welcome when it is about your experience. Abuse, slurs, threats and accusations of criminal conduct are not, and we will not publish them.

## What happens after you submit

Every review is read by a moderator before it appears. Most are published within a day or two.

If a review is almost publishable but contains one problem — a name, a phone number — we may **edit** it rather than refuse it. Where we do, the review carries a note saying it was edited by our moderators. The original text is kept so the decision can be reviewed.

If we cannot publish a review, it is refused with a reason recorded. We may write to you at the address you gave to explain why.

## Your email address

We ask for your email address so we can contact you about the review. It is encrypted, it is never published, and it is never given to the business.

## Ratings

Only published reviews count towards a business's rating. Removing a review changes the rating accordingly. A business cannot pay to have a review removed, and we will not remove one because the business asked us to — only because it breaks these guidelines.

## Reporting a review

If you think a published review breaks these rules, use the report link on it. Tell us which rule and why; a moderator will look again.`,
  },
];
