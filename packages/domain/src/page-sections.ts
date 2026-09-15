import { isMenuIconKey, validateMenuLink, type MenuIconKey } from './menus.js';

/**
 * Page sections (change log 1.17): the ready-made building blocks an editor
 * stacks to make an information page, instead of formatting one long document
 * by hand. The catalogue is fixed and every field is typed, so a page always
 * renders in the site's design and nobody can break its layout.
 *
 * This module is shared by the API (which validates and stores), the admin
 * (which edits) and the public site (which renders). Rich text inside a section
 * is limited here by length only; the API sanitises it with the same allowlist
 * as articles before anything is stored.
 */

export type PageSectionType = 'header' | 'text' | 'imageText' | 'callout' | 'cards' | 'faq' | 'businesses' | 'contact';

/** A button or link: a site path, an https address, mailto:/tel:, or a PDF from the media library. */
export interface PageButton {
  label: string;
  href: string | null;
  documentId: string | null;
}

interface SectionBase {
  /** Stable within the page, so the editor can keep focus and errors on the right section. */
  id: string;
  /** Kept on the page but not shown to visitors. */
  hidden: boolean;
}

export interface HeaderSection extends SectionBase {
  type: 'header';
  eyebrow: string | null;
  /** Empty means "use the page title". */
  heading: string | null;
  intro: string | null;
  imageId: string | null;
  button: PageButton | null;
}

export interface TextSection extends SectionBase {
  type: 'text';
  html: string;
}

export interface ImageTextSection extends SectionBase {
  type: 'imageText';
  imageId: string | null;
  heading: string | null;
  html: string;
  imageSide: 'left' | 'right';
  button: PageButton | null;
}

export interface CalloutSection extends SectionBase {
  type: 'callout';
  heading: string;
  text: string | null;
  primary: PageButton;
  secondary: PageButton | null;
  tone: 'light' | 'brand';
}

export interface PageCard {
  icon: MenuIconKey | null;
  title: string;
  text: string | null;
  href: string | null;
}

export interface CardsSection extends SectionBase {
  type: 'cards';
  heading: string | null;
  cards: PageCard[];
}

export interface FaqItem {
  question: string;
  answerHtml: string;
}

export interface FaqSection extends SectionBase {
  type: 'faq';
  heading: string | null;
  items: FaqItem[];
}

export interface BusinessesSection extends SectionBase {
  type: 'businesses';
  heading: string | null;
  businessIds: string[];
}

export interface ContactSection extends SectionBase {
  type: 'contact';
  heading: string | null;
  showForm: boolean;
}

export type PageSection = HeaderSection | TextSection | ImageTextSection | CalloutSection | CardsSection | FaqSection | BusinessesSection | ContactSection;

export const PAGE_SECTION_LIMITS = Object.freeze({
  sections: 30,
  id: 40,
  eyebrow: 60,
  heading: 120,
  intro: 300,
  calloutText: 300,
  buttonLabel: 40,
  html: 60_000,
  totalHtml: 200_000,
  cardsMin: 2,
  cardsMax: 6,
  cardTitle: 80,
  cardText: 200,
  faqMax: 20,
  question: 200,
  answerHtml: 5_000,
  businessesMax: 6,
});

export interface PageSectionDefinition {
  type: PageSectionType;
  label: string;
  /** One sentence for the "Add section" gallery. */
  description: string;
  /** Legal pages stay plain: only these may appear on a system page. */
  allowedOnSystemPages: boolean;
}

export const PAGE_SECTION_TYPES: readonly PageSectionDefinition[] = Object.freeze([
  { type: 'header', label: 'Page header', description: 'A large title with a short introduction, an optional picture and a button. Always at the top.', allowedOnSystemPages: true },
  { type: 'text', label: 'Text', description: 'Paragraphs, headings, lists, links and tables, written like a document.', allowedOnSystemPages: true },
  { type: 'imageText', label: 'Image and text', description: 'A picture beside a heading and a few paragraphs, with an optional button.', allowedOnSystemPages: false },
  { type: 'callout', label: 'Call to action', description: 'A highlighted band that asks visitors to do one thing, with one or two buttons.', allowedOnSystemPages: false },
  { type: 'cards', label: 'Feature cards', description: 'Two to six short cards with an icon, a title and a sentence — services, benefits or steps.', allowedOnSystemPages: false },
  { type: 'faq', label: 'Questions and answers', description: 'Common questions that open to show their answers.', allowedOnSystemPages: true },
  { type: 'businesses', label: 'Businesses', description: 'Up to six published businesses from the directory, shown as cards.', allowedOnSystemPages: false },
  { type: 'contact', label: 'Contact', description: 'The site’s contact details, with the enquiry form if you want it.', allowedOnSystemPages: true },
]);

export function pageSectionDefinition(type: string): PageSectionDefinition | undefined {
  return PAGE_SECTION_TYPES.find((definition) => definition.type === type);
}

export type PageSectionFieldErrors = Record<string, string[]>;

const RECORD_ID = /^[a-z0-9]{20,40}$/;
const SECTION_ID = /^[A-Za-z0-9_-]{1,40}$/;

const record = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const optionalText = (value: unknown): string | null => text(value) || null;
const html = (value: unknown): string => (typeof value === 'string' ? value : '');
const id = (value: unknown): string | null => (typeof value === 'string' && RECORD_ID.test(value.trim()) ? value.trim() : null);

function add(fields: PageSectionFieldErrors, path: string, message: string): void {
  (fields[path] ??= []).push(message);
}

function checkLength(fields: PageSectionFieldErrors, path: string, value: string | null, max: number, what: string): void {
  if (value && value.length > max) add(fields, path, `${what} is at most ${max} characters`);
}

function button(raw: unknown, path: string, fields: PageSectionFieldErrors, required: boolean): PageButton | null {
  const value = record(raw);
  const label = text(value.label);
  const hrefInput = text(value.href);
  const documentId = id(value.documentId);
  if (!label && !hrefInput && !documentId) {
    if (required) add(fields, `${path}.label`, 'Give the button a label');
    return null;
  }
  if (!label) add(fields, `${path}.label`, 'Give the button a label');
  checkLength(fields, `${path}.label`, label, PAGE_SECTION_LIMITS.buttonLabel, 'A button label');
  let href: string | null = null;
  if (!documentId) {
    if (!hrefInput) add(fields, `${path}.href`, 'Choose where the button goes');
    else {
      const link = validateMenuLink(hrefInput);
      if (!link) add(fields, `${path}.href`, 'Enter a site path such as /contact, a full https:// address, or a mailto:/tel: link');
      else href = link.url;
    }
  }
  return { label, href, documentId };
}

function htmlField(fields: PageSectionFieldErrors, path: string, value: string, max: number): string {
  if (value.length > max) add(fields, path, `This text is too long (at most ${max.toLocaleString('en-AU')} characters of formatted text)`);
  return value;
}

/**
 * Normalises a list of sections as an editor submitted it, and reports every
 * problem against its field (`sections[2].primary.href`). Unknown types and
 * unknown fields are dropped; nothing here trusts the shape it was given.
 *
 * Structural problems are errors (a header that is not first, too many cards).
 * Whether a page is *ready* — enough real text, an image chosen — is a separate
 * question answered by `pageSectionBlockers`, so a half-finished draft can
 * still be saved.
 */
export function validatePageSections(input: unknown, options: { system?: boolean } = {}): { sections: PageSection[]; fields: PageSectionFieldErrors } {
  const fields: PageSectionFieldErrors = {};
  if (!Array.isArray(input)) return { sections: [], fields: { sections: ['Sections must be a list'] } };
  if (input.length > PAGE_SECTION_LIMITS.sections) add(fields, 'sections', `A page holds at most ${PAGE_SECTION_LIMITS.sections} sections`);

  const sections: PageSection[] = [];
  const seen = new Set<string>();
  let totalHtml = 0;

  input.slice(0, PAGE_SECTION_LIMITS.sections).forEach((raw, index) => {
    const at = (field: string) => `sections[${index}].${field}`;
    const value = record(raw);
    const definition = pageSectionDefinition(text(value.type));
    if (!definition) {
      add(fields, at('type'), 'Unknown section type');
      return;
    }
    if (options.system && !definition.allowedOnSystemPages) add(fields, at('type'), `A ${definition.label.toLowerCase()} section cannot be used on this page`);
    let sectionId = text(value.id);
    if (!SECTION_ID.test(sectionId) || seen.has(sectionId)) sectionId = `s${index + 1}-${definition.type}`;
    seen.add(sectionId);
    const base = { id: sectionId, hidden: value.hidden === true };

    switch (definition.type) {
      case 'header': {
        if (index !== 0) add(fields, at('type'), 'The page header must be the first section');
        const section: HeaderSection = { ...base, type: 'header', eyebrow: optionalText(value.eyebrow), heading: optionalText(value.heading), intro: optionalText(value.intro), imageId: id(value.imageId), button: button(value.button, at('button'), fields, false) };
        checkLength(fields, at('eyebrow'), section.eyebrow, PAGE_SECTION_LIMITS.eyebrow, 'The small label');
        checkLength(fields, at('heading'), section.heading, PAGE_SECTION_LIMITS.heading, 'A heading');
        checkLength(fields, at('intro'), section.intro, PAGE_SECTION_LIMITS.intro, 'The introduction');
        sections.push(section);
        break;
      }
      case 'text': {
        const section: TextSection = { ...base, type: 'text', html: htmlField(fields, at('html'), html(value.html), PAGE_SECTION_LIMITS.html) };
        totalHtml += section.html.length;
        sections.push(section);
        break;
      }
      case 'imageText': {
        const section: ImageTextSection = {
          ...base,
          type: 'imageText',
          imageId: id(value.imageId),
          heading: optionalText(value.heading),
          html: htmlField(fields, at('html'), html(value.html), PAGE_SECTION_LIMITS.html),
          imageSide: value.imageSide === 'right' ? 'right' : 'left',
          button: button(value.button, at('button'), fields, false),
        };
        checkLength(fields, at('heading'), section.heading, PAGE_SECTION_LIMITS.heading, 'A heading');
        totalHtml += section.html.length;
        sections.push(section);
        break;
      }
      case 'callout': {
        const heading = text(value.heading);
        if (!heading) add(fields, at('heading'), 'Give the call to action a heading');
        const section: CalloutSection = {
          ...base,
          type: 'callout',
          heading,
          text: optionalText(value.text),
          primary: button(value.primary, at('primary'), fields, true) ?? { label: '', href: null, documentId: null },
          secondary: button(value.secondary, at('secondary'), fields, false),
          tone: value.tone === 'brand' ? 'brand' : 'light',
        };
        checkLength(fields, at('heading'), section.heading, PAGE_SECTION_LIMITS.heading, 'A heading');
        checkLength(fields, at('text'), section.text, PAGE_SECTION_LIMITS.calloutText, 'The text');
        sections.push(section);
        break;
      }
      case 'cards': {
        const cardsInput = Array.isArray(value.cards) ? value.cards : [];
        if (cardsInput.length > PAGE_SECTION_LIMITS.cardsMax) add(fields, at('cards'), `Use at most ${PAGE_SECTION_LIMITS.cardsMax} cards`);
        const cards = cardsInput.slice(0, PAGE_SECTION_LIMITS.cardsMax).map((cardRaw, cardIndex): PageCard => {
          const card = record(cardRaw);
          const cardAt = (field: string) => at(`cards[${cardIndex}].${field}`);
          const title = text(card.title);
          if (!title) add(fields, cardAt('title'), 'Give the card a title');
          checkLength(fields, cardAt('title'), title, PAGE_SECTION_LIMITS.cardTitle, 'A card title');
          const cardText = optionalText(card.text);
          checkLength(fields, cardAt('text'), cardText, PAGE_SECTION_LIMITS.cardText, 'A card’s text');
          const hrefInput = text(card.href);
          let href: string | null = null;
          if (hrefInput) {
            const link = validateMenuLink(hrefInput);
            if (!link) add(fields, cardAt('href'), 'Enter a site path such as /contact or a full https:// address');
            else href = link.url;
          }
          return { icon: isMenuIconKey(card.icon) ? card.icon : null, title, text: cardText, href };
        });
        const section: CardsSection = { ...base, type: 'cards', heading: optionalText(value.heading), cards };
        checkLength(fields, at('heading'), section.heading, PAGE_SECTION_LIMITS.heading, 'A heading');
        sections.push(section);
        break;
      }
      case 'faq': {
        const itemsInput = Array.isArray(value.items) ? value.items : [];
        if (itemsInput.length > PAGE_SECTION_LIMITS.faqMax) add(fields, at('items'), `Use at most ${PAGE_SECTION_LIMITS.faqMax} questions`);
        const items = itemsInput.slice(0, PAGE_SECTION_LIMITS.faqMax).map((itemRaw, itemIndex): FaqItem => {
          const item = record(itemRaw);
          const question = text(item.question);
          if (!question) add(fields, at(`items[${itemIndex}].question`), 'Write the question');
          checkLength(fields, at(`items[${itemIndex}].question`), question, PAGE_SECTION_LIMITS.question, 'A question');
          const answerHtml = htmlField(fields, at(`items[${itemIndex}].answerHtml`), html(item.answerHtml), PAGE_SECTION_LIMITS.answerHtml);
          totalHtml += answerHtml.length;
          return { question, answerHtml };
        });
        const section: FaqSection = { ...base, type: 'faq', heading: optionalText(value.heading), items };
        checkLength(fields, at('heading'), section.heading, PAGE_SECTION_LIMITS.heading, 'A heading');
        sections.push(section);
        break;
      }
      case 'businesses': {
        const ids = Array.isArray(value.businessIds) ? [...new Set(value.businessIds.map(id).filter((entry): entry is string => entry !== null))] : [];
        if (ids.length > PAGE_SECTION_LIMITS.businessesMax) add(fields, at('businessIds'), `Choose at most ${PAGE_SECTION_LIMITS.businessesMax} businesses`);
        const section: BusinessesSection = { ...base, type: 'businesses', heading: optionalText(value.heading), businessIds: ids.slice(0, PAGE_SECTION_LIMITS.businessesMax) };
        checkLength(fields, at('heading'), section.heading, PAGE_SECTION_LIMITS.heading, 'A heading');
        sections.push(section);
        break;
      }
      case 'contact': {
        const section: ContactSection = { ...base, type: 'contact', heading: optionalText(value.heading), showForm: value.showForm !== false };
        checkLength(fields, at('heading'), section.heading, PAGE_SECTION_LIMITS.heading, 'A heading');
        sections.push(section);
        break;
      }
    }
  });

  if (sections.filter((section) => section.type === 'header').length > 1) add(fields, 'sections', 'A page has at most one page header');
  if (totalHtml > PAGE_SECTION_LIMITS.totalHtml) add(fields, 'sections', 'This page is too long; split it into two pages');
  return { sections, fields };
}

/** A page written before sections existed reads as one text section holding its body. */
export function sectionsFromLegacyBody(bodyHtml: string): PageSection[] {
  return bodyHtml.trim() ? [{ id: 'text-1', hidden: false, type: 'text', html: bodyHtml }] : [];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/**
 * The page's words as one plain document: what search, excerpts, the
 * publication gate and a build of the site that predates sections read. Hidden
 * sections are left out, because visitors never see them.
 */
export function pageSectionsHtml(sections: readonly PageSection[]): string {
  const parts: string[] = [];
  for (const section of sections) {
    if (section.hidden) continue;
    switch (section.type) {
      case 'header':
        if (section.intro) parts.push(`<p>${escapeHtml(section.intro)}</p>`);
        break;
      case 'text':
        parts.push(section.html);
        break;
      case 'imageText':
        if (section.heading) parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
        parts.push(section.html);
        break;
      case 'callout':
        parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
        if (section.text) parts.push(`<p>${escapeHtml(section.text)}</p>`);
        break;
      case 'cards':
        if (section.heading) parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
        parts.push(`<ul>${section.cards.map((card) => `<li><strong>${escapeHtml(card.title)}</strong>${card.text ? ` ${escapeHtml(card.text)}` : ''}</li>`).join('')}</ul>`);
        break;
      case 'faq':
        if (section.heading) parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
        for (const item of section.items) parts.push(`<h3>${escapeHtml(item.question)}</h3>${item.answerHtml}`);
        break;
      case 'businesses':
      case 'contact':
        break;
    }
  }
  return parts.join('\n');
}

/**
 * Why the visible sections are not ready to publish, in plain sentences. The
 * page-level rules (enough real text, no placeholder wording) are applied by
 * the caller to `pageSectionsHtml`; these are the per-section ones.
 */
export function pageSectionBlockers(sections: readonly PageSection[]): string[] {
  const blockers: string[] = [];
  const label = (index: number, section: PageSection) => `${pageSectionDefinition(section.type)?.label ?? 'Section'} (section ${index + 1})`;
  const stripped = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const buttonReady = (value: PageButton | null) => value === null || (value.label !== '' && (value.href !== null || value.documentId !== null));
  sections.forEach((section, index) => {
    if (section.hidden) return;
    switch (section.type) {
      case 'header':
        if (!buttonReady(section.button)) blockers.push(`${label(index, section)}: finish or remove the button`);
        break;
      case 'text':
        if (!stripped(section.html)) blockers.push(`${label(index, section)}: add some text or remove the section`);
        break;
      case 'imageText':
        if (!section.imageId) blockers.push(`${label(index, section)}: choose a picture`);
        if (!stripped(section.html)) blockers.push(`${label(index, section)}: add some text`);
        if (!buttonReady(section.button)) blockers.push(`${label(index, section)}: finish or remove the button`);
        break;
      case 'callout':
        if (!buttonReady(section.primary) || !section.primary.label) blockers.push(`${label(index, section)}: the main button needs a label and a destination`);
        if (!buttonReady(section.secondary)) blockers.push(`${label(index, section)}: finish or remove the second button`);
        break;
      case 'cards':
        if (section.cards.length < PAGE_SECTION_LIMITS.cardsMin) blockers.push(`${label(index, section)}: add at least ${PAGE_SECTION_LIMITS.cardsMin} cards`);
        break;
      case 'faq':
        if (section.items.length === 0) blockers.push(`${label(index, section)}: add at least one question`);
        if (section.items.some((item) => !stripped(item.answerHtml))) blockers.push(`${label(index, section)}: every question needs an answer`);
        break;
      case 'businesses':
        if (section.businessIds.length === 0) blockers.push(`${label(index, section)}: choose at least one business`);
        break;
      case 'contact':
        break;
    }
  });
  return blockers;
}

/** Library images the sections show, for media use tracking and checks. */
export function pageSectionImageIds(sections: readonly PageSection[]): string[] {
  return [...new Set(sections.flatMap((section) => (section.type === 'header' || section.type === 'imageText') && section.imageId ? [section.imageId] : []))];
}

/** Library documents the sections' buttons link. */
export function pageSectionDocumentIds(sections: readonly PageSection[]): string[] {
  const buttons = sections.flatMap((section): (PageButton | null)[] => {
    switch (section.type) {
      case 'header':
      case 'imageText':
        return [section.button];
      case 'callout':
        return [section.primary, section.secondary];
      default:
        return [];
    }
  });
  return [...new Set(buttons.flatMap((entry) => (entry?.documentId ? [entry.documentId] : [])))];
}

export function pageSectionBusinessIds(sections: readonly PageSection[]): string[] {
  return [...new Set(sections.flatMap((section) => (section.type === 'businesses' ? section.businessIds : [])))];
}

/** Minimum text that counts as real content rather than a stub, as for articles. */
export const PAGE_MIN_BODY_CHARACTERS = 200;

/** Wording that must never reach the public site (SRS CFG 002: no sample or placeholder copy). */
const PAGE_PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /\bTBD\b/i,
  /\bTBC\b/i,
  /to be (written|completed|confirmed)/i,
  /placeholder/i,
  /sample (text|content|address|email)/i,
  /your (company|business) name here/i,
  /example@example\.(com|org)/i,
];

/** The page-level publication rules: a title, enough real text, no placeholder wording. */
export function pageTextBlockers(input: { title: string; plainBody: string }): string[] {
  const blockers: string[] = [];
  if (input.title.trim().length < 3) blockers.push('Title must be at least 3 characters');
  const body = input.plainBody.trim();
  if (body.length < PAGE_MIN_BODY_CHARACTERS) blockers.push(`Page content must be at least ${PAGE_MIN_BODY_CHARACTERS} characters of real copy`);
  if (PAGE_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(body) || pattern.test(input.title))) blockers.push('Remove placeholder or sample wording before publishing');
  return blockers;
}

/**
 * Everything that stops a page being published, in plain sentences: the text
 * rules and, for a page built from sections, each section's own. The API's
 * publish action and the worker's scheduled publication both call this, so a
 * page is judged the same way whichever publishes it.
 */
export function pagePublicationBlockers(input: { title: string; plainBody: string; sections: readonly PageSection[] | null }): string[] {
  return [...pageTextBlockers(input), ...(input.sections ? pageSectionBlockers(input.sections) : [])];
}
