import { Injectable } from '@nestjs/common';
import type { Prisma } from '@adelaide-sphere/database';
import { SEO_ROUTES } from '@adelaide-sphere/domain';
import { readableFileSize } from '@adelaide-sphere/domain';
import { DatabaseService } from '../database/database.service.js';
import { ObjectStoragePort } from '../media/storage.port.js';
import { RESERVED_SLUGS, isProductRoute } from '../settings/static-pages.js';
import type { MenuSourceState } from './menu-resolver.js';

export const MENU_LINK_SOURCE_TYPES = ['route', 'page', 'post', 'blog_category', 'blog_tag', 'business_category', 'area', 'business', 'document'] as const;
export type MenuLinkSourceType = (typeof MENU_LINK_SOURCE_TYPES)[number];

export interface MenuLinkSource {
  id: string;
  title: string;
  href: string;
  state: MenuSourceState;
  /** A short qualifier, e.g. the parent of a sub-category. */
  hint: string | null;
}

export interface MenuLinkSourceQuery {
  type: MenuLinkSourceType;
  q?: string;
  page: number;
  pageSize: number;
  sort: 'recent' | 'title';
}

/** Addresses the product renders itself; a stored page under one is never linked as a page. */
const PRODUCT_ROUTE_SLUGS = (RESERVED_SLUGS as readonly string[]).filter(isProductRoute);

/**
 * The "Add menu items" panels (MENU 002): titles, addresses and publication
 * state of the content a menu can link to.
 *
 * A separate read, under the menu permission, so an editor who manages
 * navigation does not also need the blog, directory or page permissions just
 * to see what exists. It returns only what a link needs — never bodies,
 * contact details or unpublished listings.
 */
@Injectable()
export class MenuLinkSourcesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStoragePort,
  ) {}

  async search(query: MenuLinkSourceQuery): Promise<{ rows: MenuLinkSource[]; total: number }> {
    const db = await this.database.client();
    const q = query.q?.trim() || undefined;
    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;
    const recent = query.sort === 'recent';

    switch (query.type) {
      case 'route': {
        const matched = SEO_ROUTES.filter((route) => !q || `${route.label} ${route.path}`.toLowerCase().includes(q.toLowerCase()));
        return {
          rows: matched.slice(skip, skip + take).map((route) => ({ id: route.key, title: route.label, href: route.path, state: 'ok', hint: route.description })),
          total: matched.length,
        };
      }
      case 'page': {
        const where: Prisma.StaticPageWhereInput = { slug: { notIn: PRODUCT_ROUTE_SLUGS }, ...(q ? { title: { contains: q } } : {}) };
        const [rows, total] = await Promise.all([
          db.staticPage.findMany({ where, orderBy: recent ? [{ updatedAt: 'desc' }, { id: 'asc' }] : [{ title: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, slug: true, title: true, status: true } }),
          db.staticPage.count({ where }),
        ]);
        return { rows: rows.map((row) => ({ id: row.id, title: row.title, href: `/${row.slug}`, state: row.status === 'published' ? 'ok' : 'unpublished', hint: null })), total };
      }
      case 'post': {
        const where: Prisma.PostWhereInput = { status: { not: 'archived' }, ...(q ? { title: { contains: q } } : {}) };
        const [rows, total] = await Promise.all([
          db.post.findMany({ where, orderBy: recent ? [{ updatedAt: 'desc' }, { id: 'asc' }] : [{ title: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, slug: true, title: true, status: true } }),
          db.post.count({ where }),
        ]);
        return {
          rows: rows.map((row) => ({ id: row.id, title: row.title, href: `/blog/${row.slug}`, state: row.status === 'published' ? 'ok' : row.status === 'scheduled' ? 'scheduled' : 'unpublished', hint: null })),
          total,
        };
      }
      case 'blog_category': {
        const where: Prisma.BlogCategoryWhereInput = q ? { name: { contains: q } } : {};
        const [rows, total] = await Promise.all([
          db.blogCategory.findMany({ where, orderBy: recent ? [{ updatedAt: 'desc' }, { id: 'asc' }] : [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, slug: true, name: true, active: true } }),
          db.blogCategory.count({ where }),
        ]);
        return { rows: rows.map((row) => ({ id: row.id, title: row.name, href: `/blog/category/${row.slug}`, state: row.active ? 'ok' : 'inactive', hint: null })), total };
      }
      case 'blog_tag': {
        const where: Prisma.BlogTagWhereInput = q ? { name: { contains: q } } : {};
        const [rows, total] = await Promise.all([
          db.blogTag.findMany({ where, orderBy: recent ? [{ updatedAt: 'desc' }, { id: 'asc' }] : [{ name: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, slug: true, name: true, active: true } }),
          db.blogTag.count({ where }),
        ]);
        return { rows: rows.map((row) => ({ id: row.id, title: row.name, href: `/blog/tag/${row.slug}`, state: row.active ? 'ok' : 'inactive', hint: null })), total };
      }
      case 'business_category': {
        const where: Prisma.CategoryWhereInput = q ? { name: { contains: q } } : {};
        const [rows, total] = await Promise.all([
          db.category.findMany({
            where,
            orderBy: recent ? [{ updatedAt: 'desc' }, { id: 'asc' }] : [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, slug: true, name: true, active: true, parent: { select: { name: true, active: true } } },
          }),
          db.category.count({ where }),
        ]);
        return {
          rows: rows.map((row) => ({ id: row.id, title: row.name, href: `/business/category/${row.slug}`, state: row.active && (row.parent?.active ?? true) ? 'ok' : 'inactive', hint: row.parent ? `in ${row.parent.name}` : null })),
          total,
        };
      }
      case 'area': {
        const where: Prisma.LocalAreaWhereInput = q ? { name: { contains: q } } : {};
        const [rows, total] = await Promise.all([
          db.localArea.findMany({ where, orderBy: recent ? [{ updatedAt: 'desc' }, { id: 'asc' }] : [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, slug: true, name: true, active: true } }),
          db.localArea.count({ where }),
        ]);
        return { rows: rows.map((row) => ({ id: row.id, title: row.name, href: `/business/area/${row.slug}`, state: row.active ? 'ok' : 'inactive', hint: null })), total };
      }
      case 'business': {
        // Published listings only: a menu editor has no business seeing drafts.
        const where: Prisma.BusinessWhereInput = { status: 'published', ...(q ? { name: { contains: q } } : {}) };
        const [rows, total] = await Promise.all([
          db.business.findMany({ where, orderBy: recent ? [{ publishedAt: 'desc' }, { id: 'asc' }] : [{ name: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, slug: true, name: true } }),
          db.business.count({ where }),
        ]);
        return { rows: rows.map((row) => ({ id: row.id, title: row.name, href: `/business/${row.slug}`, state: 'ok', hint: null })), total };
      }
      case 'document': {
        // PDFs from the media library (change log 1.16); one still being checked is listed but not yet linkable publicly.
        const where: Prisma.MediaAssetWhereInput = { kind: 'document', status: { not: 'rejected' }, ...(q ? { OR: [{ title: { contains: q } }, { sourceName: { contains: q } }] } : {}) };
        const [rows, total] = await Promise.all([
          db.mediaAsset.findMany({ where, orderBy: recent ? [{ createdAt: 'desc' }, { id: 'asc' }] : [{ title: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, title: true, sourceName: true, status: true, bytes: true, pageCount: true, publicObjectKey: true } }),
          db.mediaAsset.count({ where }),
        ]);
        return {
          rows: rows.map((row) => ({
            id: row.id,
            title: row.title ?? row.sourceName,
            href: row.publicObjectKey ? this.storage.publicUrl(row.publicObjectKey) : '',
            state: row.status === 'ready' ? 'ok' : 'unpublished',
            hint: ['PDF', readableFileSize(row.bytes), row.pageCount ? `${row.pageCount} page${row.pageCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
          })),
          total,
        };
      }
    }
  }
}
