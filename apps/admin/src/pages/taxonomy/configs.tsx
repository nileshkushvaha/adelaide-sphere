import { Typography } from 'antd';
import { Pill } from '@/components/ui';
import { formatDate } from '@/shared/format';
import type { TermsPageConfig } from './TermsPage';
import { PERMISSION } from '@/auth/permissions';

/** The name field, with an example drawn from the taxonomy being edited. */
const name = (placeholder: string) => ({ name: 'name', label: 'Name', input: 'text' as const, required: true, max: 80, placeholder });
const sortOrder = { name: 'sortOrder', label: 'Display order', input: 'number' as const, help: 'Lower numbers appear first. Terms with the same number are ordered by name.' };

/**
 * The address is shown the way a CMS shows it — one line under the name, edited
 * deliberately — for the two taxonomies that have a public page of their own.
 * Changing one leaves a 301 behind (SRS SEO 004).
 */
const address = (base: string) => ({ name: 'slug', label: 'Address', input: 'permalink' as const, base, help: 'Made from the name when left empty. Changing it redirects the old address to the new one.' });

export const CATEGORIES_CONFIG: TermsPageConfig = {
  kind: 'categories',
  title: 'Categories',
  singular: 'Category',
  intro: 'Organise listings into directory categories. Categories nest at most two levels.',
  fields: [
    name('e.g. Cafés and coffee'),
    address('/business/category'),
    { name: 'parentId', label: 'Parent category', input: 'parent', help: 'Only top-level categories can be parents.' },
    sortOrder,
    { name: 'description', label: 'Description', input: 'textarea', max: 500, placeholder: 'What belongs in this category, in a sentence or two. Shown on the tile and the category page.' },
    { name: 'imageMediaId', label: 'Image', input: 'media', preview: 'image', emptyLabel: 'No image yet', clearLabel: 'Remove image', aspectRatio: '4 / 3', help: 'Shown on the home-page tile and at the top of the category page.' },
    { section: { title: 'Search appearance', description: 'How this category appears in search results and when shared. Each falls back to the name or description when empty.' }, name: 'seoTitle', label: 'SEO title', input: 'text', max: 180, placeholder: 'e.g. Cafés in Adelaide — find a local coffee shop' },
    { name: 'seoDescription', label: 'Meta description', input: 'textarea', max: 300, placeholder: 'The summary shown under the title in search results' },
    { name: 'seoKeywords', label: 'Keywords', input: 'text', max: 255, placeholder: 'e.g. cafes, coffee, melbourne', help: 'Comma separated. Search engines ignore this tag; it will not affect ranking.' },
    { name: 'ogImageMediaId', label: 'Share image', input: 'media', preview: 'ogImage', emptyLabel: 'The category image is used', clearLabel: 'Use the category image', aspectRatio: '1.91 / 1', help: 'Used when the page is shared. Empty uses the category image, then the site image.' },
  ],
};

export const SERVICES_CONFIG: TermsPageConfig = {
  kind: 'services',
  title: 'Services',
  singular: 'Service',
  intro: 'The services listings can offer. Synonyms help visitors find them by other words.',
  // A service has no page of its own — it is a search facet — so its address
  // is made from the name and never shown.
  fields: [
    name('e.g. Plumbing'),
    { name: 'icon', label: 'Icon', input: 'icon', help: 'Shown beside the service on every listing that offers it.' },
    { name: 'synonyms', label: 'Search synonyms', input: 'tags', help: 'Other words people search for, e.g. “plumber” for Plumbing. Up to 20.' },
  ],
  columns: [{ title: 'Synonyms', render: (item) => ('synonyms' in item ? item.synonyms.join(', ') || '—' : '—') }],
};

export const AREAS_CONFIG: TermsPageConfig = {
  kind: 'areas',
  title: 'Local areas',
  singular: 'Local area',
  intro: 'The approved Adelaide areas listings can belong to. Adelaide only, by design.',
  // Whether an area's boundary was checked, and when — the fact SRS BUS 008
  // asks to be recorded, shown as the date rather than a bare yes/no.
  columns: [
    {
      title: 'Verified',
      render: (item) =>
        'eligibilityVerifiedAt' in item && item.eligibilityVerifiedAt ? (
          <Typography.Text>{formatDate(item.eligibilityVerifiedAt)}</Typography.Text>
        ) : (
          <Pill tone="attention">Not verified</Pill>
        ),
    },
  ],
  fields: [
    name('e.g. Fitzroy'),
    address('/business/area'),
    { name: 'eligibilitySource', label: 'How this area was verified', input: 'text', max: 255, placeholder: 'e.g. City of Adelaide suburb list', help: 'Where the boundary came from. Saving records the time.' },
    sortOrder,
    { name: 'editorialIntro', label: 'Editorial introduction', input: 'textarea', max: 5000, placeholder: 'A paragraph about the area, shown above its listings. Without it the page is not indexed.' },
    { name: 'imageMediaId', label: 'Image', input: 'media', preview: 'image', emptyLabel: 'No image yet', clearLabel: 'Remove image', aspectRatio: '4 / 3', help: 'Shown at the top of the area page and on the home page.' },
    { section: { title: 'Search appearance', description: 'How this area appears in search results and when shared. Each falls back to the name or introduction when empty.' }, name: 'seoTitle', label: 'SEO title', input: 'text', max: 180, placeholder: 'e.g. Businesses in Carlton — cafés, shops and services' },
    { name: 'seoDescription', label: 'Meta description', input: 'textarea', max: 300, placeholder: 'The summary shown under the title in search results' },
    { name: 'seoKeywords', label: 'Keywords', input: 'text', max: 255, placeholder: 'e.g. carlton, lygon street, melbourne', help: 'Comma separated. Search engines ignore this tag; it will not affect ranking.' },
    { name: 'ogImageMediaId', label: 'Share image', input: 'media', preview: 'ogImage', emptyLabel: 'The area image is used', clearLabel: 'Use the area image', aspectRatio: '1.91 / 1', help: 'Used when the page is shared. Empty uses the area image, then the site image.' },
  ],
};

/** Each taxonomy is its own menu item with its own permissions (change log 1.13). */
export const TERM_PERMISSIONS = {
  categories: { create: PERMISSION.categoriesCreate, update: PERMISSION.categoriesUpdate },
  services: { create: PERMISSION.servicesCreate, update: PERMISSION.servicesUpdate },
  areas: { create: PERMISSION.areasCreate, update: PERMISSION.areasUpdate },
} as const;
