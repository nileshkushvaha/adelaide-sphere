import type { BlogTermKind } from '@/api/blog';
import { PERMISSION } from '@/auth/permissions';

export interface EditorialTermsConfig {
  kind: BlogTermKind;
  title: string;
  singular: string;
  intro: string;
  /** Where one of these lives on the public site, for the address row. */
  publicBase: string;
}

export const BLOG_CATEGORIES_CONFIG: EditorialTermsConfig = {
  kind: 'blog-categories',
  title: 'Blog categories',
  singular: 'Category',
  intro: 'Each article has exactly one category. Landing content is written in Markdown and sanitised before it is stored.',
  publicBase: '/blog/category',
};

export const BLOG_TAGS_CONFIG: EditorialTermsConfig = {
  kind: 'blog-tags',
  title: 'Blog tags',
  singular: 'Tag',
  intro: 'Optional labels. A tag without landing content is not indexed by search engines.',
  publicBase: '/blog/tag',
};

/** Blog categories and blog tags are separate menu items with their own permissions (change log 1.13). */
export const EDITORIAL_TERM_PERMISSIONS = {
  'blog-categories': { create: PERMISSION.blogCategoriesCreate, update: PERMISSION.blogCategoriesUpdate },
  'blog-tags': { create: PERMISSION.blogTagsCreate, update: PERMISSION.blogTagsUpdate },
} as const;
