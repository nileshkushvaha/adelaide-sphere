import {
  PAGE_SECTION_LIMITS,
  PAGE_SECTION_TYPES,
  pageSectionDefinition,
  type PageButton,
  type PageSection,
  type PageSectionDefinition,
  type PageSectionType,
} from '@adelaide-sphere/domain/page-sections';

/**
 * The page editor's model (change log 1.17): pure functions over the section
 * list, kept out of the components so the rules — a header only at the top,
 * system pages plain, limits from the shared catalogue — are stated once and
 * are easy to test.
 */

export type FieldErrors = Record<string, string[]>;

/** Short, unique within a page, and within the validator's `[A-Za-z0-9_-]{1,40}`. */
export function newSectionId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 12);
  return `s${Date.now().toString(36)}${random}`;
}

export const emptyButton = (): PageButton => ({ label: '', href: null, documentId: null });

/** A new, empty section of a type. Guidance lives in the fields' placeholders, never in saved content. */
export function newSection(type: PageSectionType): PageSection {
  const base = { id: newSectionId(), hidden: false };
  switch (type) {
    case 'header':
      return { ...base, type, eyebrow: null, heading: null, intro: null, imageId: null, button: null };
    case 'text':
      return { ...base, type, html: '' };
    case 'imageText':
      return { ...base, type, imageId: null, heading: null, html: '', imageSide: 'left', button: null };
    case 'callout':
      return { ...base, type, heading: '', text: null, primary: emptyButton(), secondary: null, tone: 'brand' };
    case 'cards':
      return { ...base, type, heading: null, cards: [emptyCard(), emptyCard(), emptyCard()] };
    case 'faq':
      return { ...base, type, heading: null, items: [{ question: '', answerHtml: '' }] };
    case 'businesses':
      return { ...base, type, heading: null, businessIds: [] };
    case 'contact':
      return { ...base, type, heading: null, showForm: true };
  }
}

export const emptyCard = () => ({ icon: null, title: '', text: null, href: null });

export interface PageTemplate {
  key: 'information' | 'service' | 'policy' | 'blank';
  label: string;
  description: string;
  sections: PageSectionType[];
  /** Offered for pages that may use every section type. */
  richSections: boolean;
}

/** Starting points for a new page. Each is only an arrangement of empty sections. */
export const PAGE_TEMPLATES: readonly PageTemplate[] = [
  { key: 'information', label: 'Information page', description: 'A page header and a block of text. Right for most pages.', sections: ['header', 'text'], richSections: false },
  { key: 'service', label: 'Service or landing page', description: 'Header, feature cards, image and text, questions and a call to action.', sections: ['header', 'cards', 'imageText', 'faq', 'callout'], richSections: true },
  { key: 'policy', label: 'Policy', description: 'Text only, for terms, policies and statements.', sections: ['text'], richSections: false },
  { key: 'blank', label: 'Blank', description: 'One empty text section. Add what you need.', sections: ['text'], richSections: false },
];

export const sectionsForTemplate = (template: PageTemplate): PageSection[] => template.sections.map(newSection);

/**
 * The section types that can be added at the end of this page: legal pages
 * stay plain, and a header only while the page has none (it is placed first).
 */
export function addableSectionTypes(sections: readonly PageSection[], system: boolean): PageSectionDefinition[] {
  const hasHeader = sections.some((section) => section.type === 'header');
  return PAGE_SECTION_TYPES.filter((definition) => (!system || definition.allowedOnSystemPages) && !(definition.type === 'header' && hasHeader));
}

/** Adds a section: a header always goes to the top, everything else to the end. */
export function insertSection(sections: readonly PageSection[], type: PageSectionType): { sections: PageSection[]; index: number } {
  const section = newSection(type);
  if (type === 'header') return { sections: [section, ...sections], index: 0 };
  return { sections: [...sections, section], index: sections.length };
}

/** True when a move keeps the page header in first place. */
export function isValidOrder(sections: readonly PageSection[]): boolean {
  return sections.every((section, index) => section.type !== 'header' || index === 0);
}

export function moveSection(sections: readonly PageSection[], from: number, to: number): PageSection[] | null {
  if (from === to || to < 0 || to >= sections.length) return null;
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return isValidOrder(next) ? next : null;
}

export function duplicateSection(sections: readonly PageSection[], index: number): PageSection[] | null {
  const source = sections[index];
  if (!source || source.type === 'header' || sections.length >= PAGE_SECTION_LIMITS.sections) return null;
  const copy = { ...structuredClone(source), id: newSectionId() };
  return [...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)];
}

export const sectionLabel = (section: PageSection): string => pageSectionDefinition(section.type)?.label ?? 'Section';

const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (value: string, length = 80) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

/** One line that tells sections apart in the collapsed list. */
export function sectionSummary(section: PageSection, pageTitle: string): string {
  switch (section.type) {
    case 'header':
      return clip(section.heading || pageTitle || 'Uses the page title');
    case 'text':
      return clip(plain(section.html)) || 'No text yet';
    case 'imageText':
      return clip(section.heading || plain(section.html)) || 'No text yet';
    case 'callout':
      return clip(section.heading) || 'No heading yet';
    case 'cards': {
      const titled = section.cards.filter((card) => card.title).map((card) => card.title);
      return titled.length ? clip(titled.join(' · ')) : `${section.cards.length} empty cards`;
    }
    case 'faq':
      return `${section.items.length} ${section.items.length === 1 ? 'question' : 'questions'}${section.heading ? ` · ${clip(section.heading, 50)}` : ''}`;
    case 'businesses':
      return `${section.businessIds.length} ${section.businessIds.length === 1 ? 'business' : 'businesses'}`;
    case 'contact':
      return section.showForm ? 'Contact details and the enquiry form' : 'Contact details';
  }
}

/** The API's errors for one section, with the `sections[i].` prefix removed. */
export function errorsForSection(errors: FieldErrors, index: number): FieldErrors {
  const prefix = `sections[${index}].`;
  return Object.fromEntries(Object.entries(errors).flatMap(([key, messages]) => (key.startsWith(prefix) ? [[key.slice(prefix.length), messages]] : [])));
}

/** The first message for a field path, for an input's `help`. */
export const firstError = (errors: FieldErrors, path: string): string | undefined => errors[path]?.[0];

/** Every error key under a path, e.g. all of `cards[1].`. */
export function errorsUnder(errors: FieldErrors, prefix: string): FieldErrors {
  return Object.fromEntries(Object.entries(errors).flatMap(([key, messages]) => (key.startsWith(prefix) ? [[key.slice(prefix.length), messages]] : [])));
}

/** Splits an API validation response into page-level fields and section errors. */
export function splitFieldErrors(fields: FieldErrors): { form: FieldErrors; sections: FieldErrors } {
  const form: FieldErrors = {};
  const sections: FieldErrors = {};
  for (const [key, messages] of Object.entries(fields)) (key === 'sections' || key.startsWith('sections[') ? sections : form)[key] = messages;
  return { form, sections };
}

/** Indexes of the sections that have at least one error. */
export function sectionIndexesWithErrors(errors: FieldErrors): number[] {
  return [...new Set(Object.keys(errors).flatMap((key) => (/^sections\[(\d+)\]/.exec(key) ? [Number(/^sections\[(\d+)\]/.exec(key)![1])] : [])))].sort((a, b) => a - b);
}
