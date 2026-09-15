import { Controller, Get, Header, HttpException, HttpStatus, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators.js';
import { PublicBusinessCardDto, PublicBusinessDetailDto, SearchBusinessesQueryDto, SearchMetaDto } from './dto/public-business.dto.js';
import { SearchService } from './search/search.service.js';
import { PublicRateLimitService, RateLimiterUnavailableError } from './search/public-rate-limit.service.js';
import { MAX_SUGGESTIONS, SuggestionsService } from './search/suggestions.service.js';
import { SuggestionsQueryDto, SuggestionsDto } from './dto/public-business.dto.js';

/** Public directory (SRS section 15 table): published projections only, short public cache pending Phase 22 invalidation. */
@ApiTags('public-directory')
@Public()
@Controller('businesses')
export class DirectoryPublicController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Search published businesses (q, category, area, minRating, sort, page, pageSize)' })
  @ApiExtraModels(PublicBusinessCardDto, SearchMetaDto)
  @ApiOkResponse({ type: [PublicBusinessCardDto], description: '{data: PublicBusinessCardDto[], meta: SearchMetaDto}' })
  list(@Query() query: SearchBusinessesQueryDto) {
    return this.search.search(query);
  }

  @Get(':idOrSlug/related')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Up to four related published businesses (same category, same area preferred)' })
  @ApiOkResponse({ type: [PublicBusinessCardDto] })
  async related(@Param('idOrSlug') id: string) {
    return { data: await this.search.relatedById(id) };
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Public business detail (404 unless published)' })
  @ApiOkResponse({ type: PublicBusinessDetailDto })
  async detail(@Param('slug') slug: string) {
    return { data: await this.search.detailBySlug(slug) };
  }
}

/** Typed suggestions for the hero search (SRS HERO 005, API 004 public rate ceiling). */
@ApiTags('public-directory')
@Public()
@Controller('search')
export class SearchPublicController {
  /** Conservative ceiling: keystroke-debounced clients stay well inside it. */
  private static readonly LIMIT = { max: 30, windowSeconds: 60 };

  constructor(
    private readonly suggestions: SuggestionsService,
    private readonly rateLimit: PublicRateLimitService,
  ) {}

  @Get('suggestions')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: `Grouped category, service and business suggestions (q ≥ 2 characters, at most ${MAX_SUGGESTIONS})` })
  @ApiOkResponse({ type: SuggestionsDto })
  async suggest(@Query() query: SuggestionsQueryDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    let decision;
    try {
      decision = await this.rateLimit.consume('suggestions', req.ip ?? 'unknown', SearchPublicController.LIMIT.max, SearchPublicController.LIMIT.windowSeconds);
    } catch (error) {
      if (error instanceof RateLimiterUnavailableError) throw new HttpException({ code: 'SERVICE_UNAVAILABLE', message: 'Suggestions are temporarily unavailable' }, HttpStatus.SERVICE_UNAVAILABLE);
      throw error;
    }
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return { data: await this.suggestions.suggest(query.q) };
  }
}
