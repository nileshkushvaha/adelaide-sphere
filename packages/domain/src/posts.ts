/**
 * Article publication rules (SRS BLOG 002), shared by the API, which enforces
 * them, and the admin, which shows them as a live checklist while the article
 * is written — so a writer sees exactly the requirements the server will apply,
 * in the same words, before pressing Publish rather than after.
 *
 * Plain text is passed in rather than HTML: the server derives it with its
 * sanitiser and the browser with the DOM, and neither implementation belongs
 * in a shared package.
 */

export const POST_STATES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type PostStatus = (typeof POST_STATES)[number];

/** Explicit transitions; anything else is refused. */
export const POST_TRANSITIONS = {
  publish: { from: ['draft', 'scheduled'] as PostStatus[], to: 'published' as PostStatus },
  schedule: { from: ['draft', 'scheduled'] as PostStatus[], to: 'scheduled' as PostStatus },
  unpublish: { from: ['published', 'scheduled'] as PostStatus[], to: 'draft' as PostStatus },
  archive: { from: ['draft', 'scheduled', 'published'] as PostStatus[], to: 'archived' as PostStatus },
  restore: { from: ['archived'] as PostStatus[], to: 'draft' as PostStatus },
} as const;

export type PostAction = keyof typeof POST_TRANSITIONS;

export const MIN_TITLE_CHARACTERS = 3;
export const MIN_EXCERPT_CHARACTERS = 20;
export const MIN_BODY_CHARACTERS = 200;
/** Length of a summary written from the article's opening text. */
export const DERIVED_EXCERPT_CHARACTERS = 160;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidPostSlug(slug: string): boolean {
  return SLUG.test(slug);
}

export interface PostPublicationInput {
  title: string;
  slug: string;
  excerpt: string;
  /** The article's text without markup. */
  plainBody: string;
  authorActive: boolean;
  categoryActive: boolean;
}

export type PostRequirementCode = 'title' | 'slug' | 'excerpt' | 'body' | 'author' | 'category';

export interface PostRequirement {
  code: PostRequirementCode;
  /** The form field that satisfies it, for "take me there". */
  field: 'title' | 'slug' | 'excerpt' | 'bodyMarkdown' | 'authorId' | 'categoryId';
  met: boolean;
  /** What to do when unmet; what was done when met. */
  message: string;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Every requirement, met or not, in the order a writer meets them. */
export function postPublicationChecklist(input: PostPublicationInput): PostRequirement[] {
  const title = input.title.trim().length;
  const excerpt = input.excerpt.trim().length;
  const body = input.plainBody.replace(/\s+/g, ' ').trim().length;
  return [
    { code: 'title', field: 'title', met: title >= MIN_TITLE_CHARACTERS, message: title >= MIN_TITLE_CHARACTERS ? 'Title added' : `Add a title of at least ${MIN_TITLE_CHARACTERS} characters` },
    {
      code: 'body',
      field: 'bodyMarkdown',
      met: body >= MIN_BODY_CHARACTERS,
      message: body >= MIN_BODY_CHARACTERS ? 'The article is long enough' : `Write at least ${MIN_BODY_CHARACTERS} characters in the article — ${plural(body, 'character')} so far`,
    },
    {
      code: 'excerpt',
      field: 'excerpt',
      met: excerpt >= MIN_EXCERPT_CHARACTERS,
      message: excerpt >= MIN_EXCERPT_CHARACTERS ? 'Summary added' : `Write a summary of at least ${MIN_EXCERPT_CHARACTERS} characters — ${plural(excerpt, 'character')} so far`,
    },
    { code: 'category', field: 'categoryId', met: input.categoryActive, message: input.categoryActive ? 'Category chosen' : 'Choose a category' },
    { code: 'author', field: 'authorId', met: input.authorActive, message: input.authorActive ? 'Author chosen' : 'Choose an author' },
    { code: 'slug', field: 'slug', met: isValidPostSlug(input.slug), message: isValidPostSlug(input.slug) ? 'Web address is valid' : 'Fix the web address: use lowercase letters, numbers and single hyphens' },
  ];
}

/** The unmet requirements' messages; empty when the article may be published. */
export function postPublicationBlockers(input: PostPublicationInput): string[] {
  return postPublicationChecklist(input)
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.message);
}

/** A schedule must be in the future; the API stores UTC while admins choose Adelaide time. */
export function scheduleBlockers(scheduledAt: Date | null, now: Date): string[] {
  if (!scheduledAt) return ['Choose a date and time to publish'];
  if (Number.isNaN(scheduledAt.getTime())) return ['The scheduled time is not a valid date'];
  if (scheduledAt.getTime() <= now.getTime()) return ['Choose a time in the future'];
  return [];
}

/**
 * A summary written from the article's opening text, for a writer who left it
 * empty. It ends at a sentence where one fits, otherwise at a word, and never
 * mid-word. Returns an empty string when the text is too short to summarise.
 */
export function deriveExcerpt(plainBody: string, max = DERIVED_EXCERPT_CHARACTERS): string {
  const text = plainBody.replace(/\s+/g, ' ').trim();
  if (text.length < MIN_EXCERPT_CHARACTERS) return '';
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  if (sentenceEnd >= MIN_EXCERPT_CHARACTERS) return window.slice(0, sentenceEnd + 1);
  const wordEnd = window.lastIndexOf(' ');
  return `${(wordEnd > MIN_EXCERPT_CHARACTERS ? window.slice(0, wordEnd) : window).replace(/[\s,;:.-]+$/, '')}…`;
}

/** How many articles can be featured on the home page and the blog index at once (SRS 1.10 BLOG 005). */
export const MAX_FEATURED_POSTS = 3;
