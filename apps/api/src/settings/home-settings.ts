/**
 * Home/hero settings (SRS CFG 001, HERO 002/007). The payload is a validated
 * document owned by the API: admins edit wording and toggles, never markup,
 * secrets or the fixed Adelaide context.
 */
/**
 * One hero banner slide (SRS HERO 001): an Adelaide photograph with a focal
 * point and an optional caption. Slides rotate; the headline and search panel
 * stay fixed above them, so the accessible meaning never changes.
 */
export interface HeroSlide {
  /** Ready media asset used as the background image. */
  mediaId: string;
  /** Optional short caption/credit shown over the image. */
  caption?: string | null;
  /** Focal point as fractions of width/height, so the subject survives cropping. */
  focalX: number;
  focalY: number;
}

export interface HomeSettings {
  /** Stable accessible headline; the rotating phrases never change its meaning (HERO 002). */
  heroHeadline: string;
  /** 2–5 phrases rotated in the hero. */
  heroPhrases: string[];
  /** 0–6 background slides; with none, the hero uses the solid navy fallback (HERO 001). */
  heroSlides: HeroSlide[];
  /** Counters are optional and only ever computed from published records (HERO 007). */
  countersEnabled: boolean;
}

export const HOME_SETTINGS_KEY = 'home';
export const MIN_PHRASES = 2;
export const MAX_PHRASES = 5;
export const MAX_PHRASE_LENGTH = 60;
export const MAX_HEADLINE_LENGTH = 80;
export const MAX_HERO_SLIDES = 6;
export const MAX_CAPTION_LENGTH = 120;

/** SRS HERO 002's own example wording; deliberately not sample marketing copy. */
export const DEFAULT_HOME_SETTINGS: HomeSettings = Object.freeze({
  heroHeadline: 'Discover Adelaide businesses',
  heroPhrases: ['local services', 'places to eat', 'independent shops'],
  heroSlides: [],
  countersEnabled: false,
});

export type FieldErrors = Record<string, string[]>;

/** Server-side validation (CFG 001); returns the normalised settings and any field errors. */
export function validateHomeSettings(input: unknown): { errors: FieldErrors; value: HomeSettings } {
  const errors: FieldErrors = {};
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Partial<Record<keyof HomeSettings, unknown>>;

  const headline = typeof raw.heroHeadline === 'string' ? raw.heroHeadline.replace(/\s+/g, ' ').trim() : '';
  if (headline.length < 3 || headline.length > MAX_HEADLINE_LENGTH) errors.heroHeadline = [`Headline must be 3–${MAX_HEADLINE_LENGTH} characters`];

  const phrasesInput = Array.isArray(raw.heroPhrases) ? raw.heroPhrases : null;
  const phrases: string[] = [];
  if (!phrasesInput) {
    errors.heroPhrases = ['Provide a list of phrases'];
  } else if (phrasesInput.length < MIN_PHRASES || phrasesInput.length > MAX_PHRASES) {
    errors.heroPhrases = [`Provide between ${MIN_PHRASES} and ${MAX_PHRASES} phrases`];
  } else {
    phrasesInput.forEach((phrase, index) => {
      if (typeof phrase !== 'string') {
        errors[`heroPhrases.${index}`] = ['Each phrase must be text'];
        return;
      }
      const trimmed = phrase.replace(/\s+/g, ' ').trim();
      if (trimmed.length < 2 || trimmed.length > MAX_PHRASE_LENGTH) errors[`heroPhrases.${index}`] = [`Each phrase must be 2–${MAX_PHRASE_LENGTH} characters`];
      else if (phrases.some((p) => p.toLowerCase() === trimmed.toLowerCase())) errors[`heroPhrases.${index}`] = ['Phrases must be different'];
      else phrases.push(trimmed);
    });
  }

  const slidesInput = raw.heroSlides === undefined ? [] : raw.heroSlides;
  const slides: HeroSlide[] = [];
  if (!Array.isArray(slidesInput)) {
    errors.heroSlides = ['Provide a list of hero slides'];
  } else if (slidesInput.length > MAX_HERO_SLIDES) {
    errors.heroSlides = [`At most ${MAX_HERO_SLIDES} hero slides`];
  } else {
    slidesInput.forEach((entry, index) => {
      const slide = (typeof entry === 'object' && entry !== null ? entry : {}) as Partial<Record<keyof HeroSlide, unknown>>;
      const mediaId = typeof slide.mediaId === 'string' ? slide.mediaId.trim() : '';
      if (mediaId === '' || mediaId.length > 64) {
        errors[`heroSlides.${index}.mediaId`] = ['Choose an image for this slide'];
        return;
      }
      if (slides.some((existing) => existing.mediaId === mediaId)) {
        errors[`heroSlides.${index}.mediaId`] = ['That image is already used by another slide'];
        return;
      }
      const caption = typeof slide.caption === 'string' ? slide.caption.replace(/\s+/g, ' ').trim() : '';
      if (caption.length > MAX_CAPTION_LENGTH) {
        errors[`heroSlides.${index}.caption`] = [`Captions must be ${MAX_CAPTION_LENGTH} characters or fewer`];
        return;
      }
      const fraction = (value: unknown): number | null => {
        if (value === undefined || value === null) return 0.5;
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
      };
      const focalX = fraction(slide.focalX);
      const focalY = fraction(slide.focalY);
      if (focalX === null || focalY === null) {
        errors[`heroSlides.${index}.focalX`] = ['Focal points must be between 0 and 1'];
        return;
      }
      slides.push({ mediaId, caption: caption === '' ? null : caption, focalX, focalY });
    });
  }

  const countersEnabled = raw.countersEnabled;
  if (typeof countersEnabled !== 'boolean') errors.countersEnabled = ['Choose whether counters are shown'];

  return { errors, value: { heroHeadline: headline, heroPhrases: phrases, heroSlides: slides, countersEnabled: countersEnabled === true } };
}
