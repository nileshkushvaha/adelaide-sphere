import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SiteMetricsService } from './site-metrics.service.js';

/** Live directory counts for the public About page (SRS CFG 002). */
export class SiteMetricsDto {
  @ApiProperty({ type: Number, nullable: true, description: 'Published listings; null when the count could not be taken' }) businesses!: number | null;
  @ApiProperty({ type: Number, nullable: true }) categories!: number | null;
  @ApiProperty({ type: Number, nullable: true }) areas!: number | null;
  @ApiProperty({ type: Number, nullable: true }) articles!: number | null;
  @ApiProperty({ format: 'date-time' }) countedAt!: string;
}

/** Server-owned Adelaide constants (SRS SCP 001). Not editable anywhere. */
export const SITE_CONTEXT = Object.freeze({
  city: 'Adelaide',
  state: 'SA',
  country: 'AU',
  timezone: 'Australia/Adelaide',
  locale: 'en-AU',
  /** Planning baseline until decision D01 is recorded (SRS SCP 004). */
  boundary: 'Inner Adelaide: City of Adelaide plus the Norwood Payneham & St Peters, Unley, Prospect, Walkerville, Burnside and West Torrens council areas (baseline pending client decision D01)',
});

@ApiTags('public-site')
@Controller('site')
export class SiteController {
  constructor(private readonly metrics: SiteMetricsService) {}

  @Get('context')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Fixed Adelaide context: city, state, country, timezone' })
  @ApiOkResponse({ description: '{data: {city, state, country, timezone, locale, boundary}}' })
  context() {
    return { data: SITE_CONTEXT };
  }

  /**
   * Counted at request time and cached briefly: the About page states these as
   * facts, so a stale number is a false one, and a `null` says the count is
   * unavailable rather than zero.
   */
  @Get('metrics')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Live published counts for the About page' })
  @ApiOkResponse({ type: SiteMetricsDto })
  async siteMetrics() {
    return { data: await this.metrics.metrics() };
  }
}
