import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * The fields that make an article what a reader and a search engine see
 * (AI plan §H): title, address, summary, body source, SEO, byline, taxonomy
 * and images. Derived columns (sanitised body, search text) and presentation
 * switches (featured, comments) are not material.
 */
export interface MaterialPost {
  title: string;
  slug: string;
  excerpt: string;
  bodyFormat: string;
  bodyMarkdown: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  authorId: string;
  categoryId: string;
  coverMediaId: string | null;
  coverAlt: string | null;
  ogImageMediaId: string | null;
  guestPost: boolean;
}

/** SHA-256 of an article's material state; approvals and runs are bound to it. */
export function postMaterialHash(post: MaterialPost, tagIds: readonly string[]): string {
  const material = [
    post.title,
    post.slug,
    post.excerpt,
    post.bodyFormat,
    post.bodyMarkdown,
    post.seoTitle,
    post.seoDescription,
    post.seoKeywords,
    post.authorId,
    post.categoryId,
    post.coverMediaId,
    post.coverAlt,
    post.ogImageMediaId,
    post.guestPost,
    [...new Set(tagIds)].sort(),
  ];
  return createHash('sha256').update(JSON.stringify(material)).digest('hex');
}

/** Reads an article inside the caller's transaction and returns it with its material hash. */
export async function readPostMaterial(tx: Prisma.TransactionClient, postId: string) {
  const post = await tx.post.findUnique({
    where: { id: postId },
    include: { tags: { select: { tagId: true } }, author: { select: { active: true } }, category: { select: { active: true } } },
  });
  if (!post) return null;
  return { post, hash: postMaterialHash(post, post.tags.map((tag) => tag.tagId)) };
}
