import { ApiProperty } from '@nestjs/swagger';

/** One canonical, indexable URL for a sitemap child document (SRS SEO 002). */
export class SitemapEntryDto {
  @ApiProperty({ description: 'Site-relative canonical path', example: '/business/example-cafe' }) path!: string;
  @ApiProperty({ description: 'Real last modification time, ISO 8601' }) lastModified!: string;
}

export class SitemapFeedDto {
  @ApiProperty({ type: [SitemapEntryDto] }) data!: SitemapEntryDto[];
  @ApiProperty({ type: Object, description: '{count, generatedAt}' }) meta!: { count: number; generatedAt: string };
}
