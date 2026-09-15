import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@adelaide-sphere/database';
import type { RequestContext } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { DEFAULT_HOME_SETTINGS, HOME_SETTINGS_KEY, validateHomeSettings, type HomeSettings } from './home-settings.js';
import { DEFAULT_GENERAL_SETTINGS, GENERAL_SETTINGS_KEY, SOCIAL_PLATFORMS, validateGeneralSettings, type GeneralSettings } from './general-settings.js';
import { DEFAULT_SEO_SETTINGS, EMPTY_ROUTE_SEO, SEO_SETTINGS_KEY, validateSeoSettings, type SeoSettings } from './seo-settings.js';
import type { UpdateSeoSettingsDto } from './dto/seo-settings.dto.js';
import type { PublicRouteSeoDto } from './dto/general-settings.dto.js';
import { MediaService } from '../media/media.service.js';
import { CACHE_TAGS, SEO_ROUTES, DEFAULT_ADELAIDE_MAP_SRC, SITE_MAP_TITLE } from '@adelaide-sphere/domain';
import { SettingsStoreService } from './settings-store.service.js';
import { WEBSITE_GROUP } from './registry.js';
import type { HomeSettingsRecordDto, PublicHeroSlideDto, PublicHomeDto, UpdateHomeSettingsDto } from './dto/settings.dto.js';
import type { GeneralSettingsRecordDto, PublicSiteSettingsDto, SettingsImageDto, UpdateGeneralSettingsDto } from './dto/general-settings.dto.js';

/**
 * Editable site settings (SRS CFG 001): validated server-side, versioned,
 * with the acting administrator recorded and every change audited. Reads fall
 * back to the documented defaults so the site never renders empty content.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly media: MediaService,
    private readonly store: SettingsStoreService,
  ) {}

  /**
   * Turns stored slide references into renditions the site can render. A slide
   * whose asset is missing or not processed is dropped rather than rendered
   * broken; with none left the site shows its built-in photographs (SRS HERO 001).
   */
  private async resolveSlides(slides: HomeSettings['heroSlides']): Promise<PublicHeroSlideDto[]> {
    const resolved = await Promise.all(
      slides.map(async (slide) => {
        const asset = await this.media.heroRendition(slide.mediaId);
        if (!asset) return null;
        return {
          url: asset.url,
          previewUrl: asset.previewUrl,
          alt: asset.alt,
          caption: slide.caption ?? null,
          focalX: slide.focalX,
          focalY: slide.focalY,
          width: asset.width,
          height: asset.height,
        } satisfies PublicHeroSlideDto;
      }),
    );
    return resolved.filter((slide): slide is PublicHeroSlideDto => slide !== null);
  }

  async homeSettings(): Promise<HomeSettingsRecordDto> {
    const row = await this.store.readDocument(WEBSITE_GROUP, HOME_SETTINGS_KEY);
    if (row.data === null) return { ...DEFAULT_HOME_SETTINGS, heroSlidePreviews: [], version: 0, updatedAt: row.updatedAt, updatedByAdminId: null };
    const { errors, value } = validateHomeSettings(row.data);
    if (Object.keys(errors).length > 0) {
      // A stored document that no longer validates (e.g. after a rule change) must not break the public site.
      this.logger.warn('stored home settings failed validation; serving defaults');
      return { ...DEFAULT_HOME_SETTINGS, heroSlidePreviews: [], version: row.version, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId };
    }
    return { ...value, heroSlidePreviews: await this.resolveSlides(value.heroSlides), version: row.version, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId };
  }

  async updateHomeSettings(input: UpdateHomeSettingsDto, actor: AdminPrincipal, ctx: RequestContext): Promise<HomeSettingsRecordDto> {
    const { errors, value } = validateHomeSettings(input);
    if (Object.keys(errors).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields: errors }, HttpStatus.BAD_REQUEST);
    // Every slide must be a processed image. The public read drops a slide it
    // cannot render, so accepting one here let a save succeed while the banner
    // silently kept showing the built-in photographs.
    const slideErrors: Record<string, string[]> = {};
    await Promise.all(
      value.heroSlides.map(async (slide, index) => {
        if (!(await this.media.heroRendition(slide.mediaId))) slideErrors[`heroSlides.${index}.mediaId`] = ['That image does not exist or is still being processed'];
      }),
    );
    if (Object.keys(slideErrors).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields: slideErrors }, HttpStatus.BAD_REQUEST);
    // The version check, the transaction, the audit record and the cache purge
    // are the shared settings path (SET 003); only the validation above is
    // specific to the home settings.
    const row = await this.store.writeDocument({
      group: WEBSITE_GROUP,
      key: HOME_SETTINGS_KEY,
      data: value as unknown as Prisma.InputJsonObject,
      expectedVersion: input.expectedVersion,
      actor,
      ctx,
      audit: { action: 'settings.home.update', metadata: { phrases: value.heroPhrases.length, slides: value.heroSlides.length, countersEnabled: value.countersEnabled } },
      // The home page renders these settings, so its cached copy must be purged.
      tags: [CACHE_TAGS.settings],
    });
    return { ...value, heroSlidePreviews: await this.resolveSlides(value.heroSlides), version: row.version, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId };
  }

  /** Public home payload: hero content plus counters only when enabled and available (SRS HERO 007). */
  async publicHome(): Promise<PublicHomeDto> {
    const settings = await this.homeSettings();
    const hero: PublicHomeDto = { heroHeadline: settings.heroHeadline, heroPhrases: settings.heroPhrases, heroSlides: settings.heroSlidePreviews };
    if (!settings.countersEnabled) return hero;
    try {
      const db = await this.database.client();
      const [businesses, categories, areas] = await Promise.all([
        db.business.count({ where: { status: 'published' } }),
        db.category.count({ where: { active: true, primaryOf: { some: { status: 'published' } } } }),
        db.localArea.count({ where: { active: true, businesses: { some: { status: 'published' } } } }),
      ]);
      return { ...hero, counters: { businesses, categories, areas } };
    } catch (error) {
      // Counters are optional: hide them rather than show invented totals.
      this.logger.warn(`home counters unavailable (${(error as { code?: string })?.code ?? 'error'})`);
      return hero;
    }
  }


  // ---- general settings (SRS CFG 001) ---------------------------------------

  /**
   * Stored general settings, or the documented defaults when nothing has been
   * saved. A stored document that no longer validates (after a rule change, for
   * example) is reported and replaced by the defaults rather than breaking the
   * public shell.
   */
  private async storedGeneral(): Promise<{ value: GeneralSettings; version: number; updatedAt: string; updatedByAdminId: string | null }> {
    const row = await this.store.readDocument(WEBSITE_GROUP, GENERAL_SETTINGS_KEY);
    if (row.data === null) return { value: SettingsService.generalDefaults(), version: 0, updatedAt: row.updatedAt, updatedByAdminId: null };
    const { errors, value } = validateGeneralSettings(row.data);
    if (Object.keys(errors).length > 0) {
      this.logger.warn('stored general settings failed validation; serving defaults');
      return { value: SettingsService.generalDefaults(), version: row.version, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId };
    }
    return { value, version: row.version, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId };
  }

  /** Resolves branding assets; an asset that is missing or unprocessed simply is not published (SRS MED 002). */
  private async resolveBranding(value: GeneralSettings): Promise<{ darkLogo: SettingsImageDto | null; logo: SettingsImageDto | null; favicon: SettingsImageDto | null; shareImage: SettingsImageDto | null }> {
    const [logo, darkLogo, favicon, shareImage] = await Promise.all([
      this.media.publicImageRefOfKind(value.logoMediaId, 'card'),
      this.media.publicImageRefOfKind(value.darkLogoMediaId, 'card'),
      this.media.publicImageRefOfKind(value.faviconMediaId, 'thumbnail'),
      this.media.publicImageRefOfKind(value.shareImageMediaId, 'hero'),
    ]);
    return { logo, darkLogo, favicon, shareImage };
  }

  async generalSettings(): Promise<GeneralSettingsRecordDto> {
    const stored = await this.storedGeneral();
    const branding = await this.resolveBranding(stored.value);
    return {
      ...stored.value,
      supportPhone: stored.value.supportPhone?.display ?? null,
      supportPhoneDisplay: stored.value.supportPhone,
      ...branding,
      version: stored.version,
      updatedAt: stored.updatedAt,
      updatedByAdminId: stored.updatedByAdminId,
    };
  }

  async updateGeneralSettings(input: UpdateGeneralSettingsDto, actor: AdminPrincipal, ctx: RequestContext): Promise<GeneralSettingsRecordDto> {
    const { errors, value } = validateGeneralSettings(input);
    if (Object.keys(errors).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields: errors }, HttpStatus.BAD_REQUEST);
    // Branding must reference assets that exist and are processed; otherwise the
    // shell would carry a broken image on every page.
    const mediaFields: [keyof GeneralSettings, string | null][] = [
      ['logoMediaId', value.logoMediaId],
      ['darkLogoMediaId', value.darkLogoMediaId],
      ['faviconMediaId', value.faviconMediaId],
      ['shareImageMediaId', value.shareImageMediaId],
    ];
    const mediaErrors: Record<string, string[]> = {};
    for (const [field, mediaId] of mediaFields) {
      if (!mediaId) continue;
      if (!(await this.media.publicImageRefOfKind(mediaId, 'card'))) mediaErrors[field] = ['That image does not exist or is still being processed'];
    }
    if (Object.keys(mediaErrors).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields: mediaErrors }, HttpStatus.BAD_REQUEST);

    const row = await this.store.writeDocument({
      group: WEBSITE_GROUP,
      key: GENERAL_SETTINGS_KEY,
      data: value as unknown as Prisma.InputJsonObject,
      expectedVersion: input.expectedVersion,
      actor,
      ctx,
      audit: {
        action: 'settings.general.update',
        // Metadata records what changed shape, never the values themselves.
        metadata: {
          headerTopBarEnabled: value.headerTopBarEnabled,
          socialLinks: SOCIAL_PLATFORMS.filter((platform) => value.social[platform] !== null).length,
          hasSupportEmail: value.supportEmail !== null,
          hasSupportPhone: value.supportPhone !== null,
          brandingAssets: [value.logoMediaId, value.darkLogoMediaId, value.faviconMediaId, value.shareImageMediaId].filter(Boolean).length,
        },
      },
      // Every public page renders the shell, so the whole web tier is purged.
      tags: [CACHE_TAGS.settings],
    });
    const branding = await this.resolveBranding(value);
    return {
      ...value,
      supportPhone: value.supportPhone?.display ?? null,
      supportPhoneDisplay: value.supportPhone,
      ...branding,
      version: row.version,
      updatedAt: row.updatedAt,
      updatedByAdminId: row.updatedByAdminId,
    };
  }

  /** Public shell payload (SRS CFG 001, UX 002): only values an editor has actually published. */
  async publicSiteSettings(): Promise<PublicSiteSettingsDto> {
    const { value } = await this.storedGeneral();
    const branding = await this.resolveBranding(value);
    return {
      name: value.applicationName,
      shortName: value.shortName,
      organisationName: value.organisationName,
      tagline: value.tagline,
      metaDescription: value.metaDescription,
      contact: { email: value.supportEmail, phone: value.supportPhone, websiteUrl: value.websiteUrl, address: value.address },
      branding,
      headerTopBarEnabled: value.headerTopBarEnabled,
      social: SOCIAL_PLATFORMS.flatMap((platform) => (value.social[platform] ? [{ platform, url: value.social[platform]! }] : [])),
      footer: { copyrightText: value.copyrightText, text: value.footerText },
      siteMap: { src: value.siteMapSrc ?? DEFAULT_ADELAIDE_MAP_SRC, title: SITE_MAP_TITLE },
      pricing: { enabled: value.pricing.enabled, currency: 'AUD', gstInclusive: true, plans: value.pricing.plans },
      // The public site renders these into the pages that have no record of
      // their own; sharing the shell payload keeps it to one cached request.
      seo: await this.publicRouteSeo(),
    };
  }

  /** Route overrides with their share images resolved, for the public site. */
  private async publicRouteSeo(): Promise<PublicRouteSeoDto> {
    const stored = await this.storedSeo();
    const images = await this.resolveRouteShareImages(stored.value.routes);
    const routes = Object.fromEntries(
      SEO_ROUTES.map((route) => {
        const entry = stored.value.routes[route.key] ?? EMPTY_ROUTE_SEO;
        return [route.key, { ...entry, ogImage: images[route.key] ?? null }];
      }),
    );
    return {
      routes,
      twitterCard: stored.value.twitterCard,
      // These are public identifiers — visible in the page source of any site
      // that uses them — and the site only acts on the analytics ones after a
      // visitor has accepted them (see the consent banner in apps/web).
      googleSiteVerification: stored.value.verification.googleSearchConsole,
      analytics: {
        googleAnalyticsId: stored.value.verification.googleAnalyticsId,
        googleTagManagerId: stored.value.verification.googleTagManagerId,
        facebookPixelId: stored.value.verification.facebookPixelId,
      },
    };
  }

  /** Exposed for tests and the admin "reset to defaults" action. */
  static generalDefaults(): GeneralSettings {
    return { ...DEFAULT_GENERAL_SETTINGS, social: { ...DEFAULT_GENERAL_SETTINGS.social } };
  }

  /** Exposed for tests and future settings keys. */
  static defaults(): HomeSettings {
    return { ...DEFAULT_HOME_SETTINGS, heroPhrases: [...DEFAULT_HOME_SETTINGS.heroPhrases] };
  }

  // ---- search metadata for routes with no record of their own (SEO 001) ------

  /**
   * Stored SEO settings, or the defaults. Like general settings, a document
   * that no longer validates is reported and replaced rather than allowed to
   * break every public page's metadata.
   */
  private async storedSeo(): Promise<{ value: SeoSettings; version: number; updatedAt: string; updatedByAdminId: string | null }> {
    const row = await this.store.readDocument(WEBSITE_GROUP, SEO_SETTINGS_KEY);
    if (row.data === null) return { value: structuredClone(DEFAULT_SEO_SETTINGS), version: 0, updatedAt: row.updatedAt, updatedByAdminId: null };
    const { errors, value } = validateSeoSettings(row.data);
    if (Object.keys(errors).length > 0) {
      this.logger.warn('stored SEO settings failed validation; serving defaults');
      return { value: structuredClone(DEFAULT_SEO_SETTINGS), version: row.version, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId };
    }
    return { value, version: row.version, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId };
  }

  /** The document as the admin edits it, with every declared route present. */
  async seoSettings() {
    const stored = await this.storedSeo();
    const routes: SeoSettings['routes'] = {};
    for (const route of SEO_ROUTES) routes[route.key] = stored.value.routes[route.key] ?? { ...EMPTY_ROUTE_SEO };
    const shareImages = await this.resolveRouteShareImages(routes);
    return { routes, twitterCard: stored.value.twitterCard, verification: stored.value.verification, shareImages, version: stored.version, updatedAt: stored.updatedAt, updatedByAdminId: stored.updatedByAdminId };
  }

  /** The resolved share image per route, so the admin can show what it chose. */
  private async resolveRouteShareImages(routes: SeoSettings['routes']): Promise<Record<string, SettingsImageDto>> {
    const entries = await Promise.all(
      Object.entries(routes)
        .filter(([, entry]) => entry.ogImageMediaId !== null)
        .map(async ([key, entry]) => [key, await this.media.publicImageRefOfKind(entry.ogImageMediaId, 'hero')] as const),
    );
    return Object.fromEntries(entries.filter((entry): entry is readonly [string, SettingsImageDto] => entry[1] !== null));
  }

  async updateSeoSettings(input: UpdateSeoSettingsDto, actor: AdminPrincipal, ctx: RequestContext) {
    const { errors, value } = validateSeoSettings(input);
    if (Object.keys(errors).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields: errors }, HttpStatus.BAD_REQUEST);

    // A share image must exist and be processed, or the route would advertise a
    // broken image to every social platform that fetches it.
    const mediaErrors: Record<string, string[]> = {};
    for (const [key, entry] of Object.entries(value.routes)) {
      if (!entry.ogImageMediaId) continue;
      if (!(await this.media.publicImageRefOfKind(entry.ogImageMediaId, 'hero'))) mediaErrors[`routes.${key}.ogImageMediaId`] = ['That image does not exist or is still being processed'];
    }
    if (Object.keys(mediaErrors).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields: mediaErrors }, HttpStatus.BAD_REQUEST);

    const row = await this.store.writeDocument({
      group: WEBSITE_GROUP,
      key: SEO_SETTINGS_KEY,
      data: value as unknown as Prisma.InputJsonObject,
      expectedVersion: input.expectedVersion,
      actor,
      ctx,
      audit: {
        action: 'settings.seo.update',
        // What changed shape, never the wording itself.
        metadata: {
          routesWithOverrides: Object.values(value.routes).filter((entry) => entry.metaTitle || entry.metaDescription || entry.metaKeywords || entry.canonicalUrl || entry.ogImageMediaId || entry.robots !== 'default').length,
          twitterCard: value.twitterCard,
          // Which tools are connected, never the identifiers themselves.
          connectedTools: Object.values(value.verification).filter(Boolean).length,
        },
      },
      // Metadata is rendered into every one of these pages.
      tags: [CACHE_TAGS.settings],
    });
    const routes: SeoSettings['routes'] = {};
    for (const route of SEO_ROUTES) routes[route.key] = value.routes[route.key] ?? { ...EMPTY_ROUTE_SEO };
    return { routes, twitterCard: value.twitterCard, verification: value.verification, shareImages: await this.resolveRouteShareImages(routes), version: row.version, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId };
  }
}
