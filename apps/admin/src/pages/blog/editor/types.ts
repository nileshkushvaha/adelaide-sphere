import type { Dayjs } from 'dayjs';
import type { Post, PostAction } from '@/api/blog';

/** The article form's values; the names are the API's field names. */
export interface PostFormValues {
  title: string;
  slug?: string;
  excerpt: string;
  bodyMarkdown: string;
  coverMediaId?: string | null;
  coverAlt?: string | null;
  ogImageMediaId?: string | null;
  authorId: string;
  categoryId: string;
  tagIds: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  commentsEnabled: boolean;
  guestPost?: boolean;
  revisionReason?: string;
}

export interface PostActionFormValues {
  reason?: string;
  /** The Adelaide wall-clock date and time, whatever the browser's time zone. */
  scheduledLocal?: Dayjs | null;
}

/** The form's values for a saved article. */
export function valuesFromPost(post: Post): PostFormValues {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    coverMediaId: post.coverMediaId,
    coverAlt: post.coverAlt,
    ogImageMediaId: post.ogImageMediaId,
    authorId: post.authorId,
    categoryId: post.categoryId,
    tagIds: post.tagIds,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    seoKeywords: post.seoKeywords,
    commentsEnabled: post.commentsEnabled,
    guestPost: post.guestPost,
  };
}

export const ACTION_LABELS: Record<PostAction, { label: string; title: string; hint: string; danger?: boolean }> = {
  publish: {
    label: 'Publish article',
    title: 'Publish this article?',
    hint: 'Anyone can read it on the blog from now on, it appears in the blog list and in search results, and readers can comment if comments are on. You can unpublish it again at any time.',
  },
  schedule: {
    label: 'Schedule article',
    title: 'Schedule publication',
    hint: 'Choose a date and time in Melbourne. The article goes live within a minute of that time, even if nobody is signed in.',
  },
  unpublish: {
    label: 'Unpublish article',
    title: 'Unpublish this article?',
    hint: 'It returns to drafts: readers can no longer open it and it leaves the blog list. Comments already made are kept.',
    danger: true,
  },
  archive: { label: 'Archive article', title: 'Archive this article?', hint: 'It is hidden everywhere and becomes read-only. Restore it to edit it again.', danger: true },
  restore: { label: 'Restore article', title: 'Restore this article to drafts?', hint: 'It becomes editable again and stays private until you publish it.' },
};

/** What to tell the writer once an action has worked. */
export const ACTION_DONE: Record<PostAction, string> = {
  publish: 'Article published — it is now live on the blog.',
  schedule: 'Article scheduled.',
  unpublish: 'Article unpublished and back in drafts.',
  archive: 'Article archived.',
  restore: 'Article restored to drafts.',
};

export const ACTIONS_BY_STATUS: Record<Post['status'], PostAction[]> = {
  draft: ['publish', 'schedule', 'archive'],
  scheduled: ['publish', 'schedule', 'unpublish', 'archive'],
  published: ['unpublish', 'archive'],
  archived: ['restore'],
};
