import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/pagination.js';
import { BusinessLinkDto } from './business.dto.js';
import { HoursExceptionDto, HoursStatusDto, WeeklyHoursDto } from './hours.dto.js';

export const SEARCH_SORTS = ['relevance', 'rating', 'newest', 'name'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
/** DIR 005: bounded maximum accessible result window. */
export const MAX_RESULT_WINDOW = 10_000;
export const MAX_QUERY_LENGTH = 120;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Public search query (SRS DIR 002–005). Whitespace is collapsed and case folded before matching. */
export class SearchBusinessesQueryDto {
  @ApiPropertyOptional({ maxLength: MAX_QUERY_LENGTH, description: 'Keyword: name, category, service or curated synonym' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value))
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug; active descendant categories are included' }) @IsOptional() @IsString() @MaxLength(100) @Matches(SLUG, { message: 'category must be a slug' }) category?: string;
  @ApiPropertyOptional({ description: 'Approved local area slug' }) @IsOptional() @IsString() @MaxLength(100) @Matches(SLUG, { message: 'area must be a slug' }) area?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Minimum approved average rating' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) minRating?: number;
  @ApiPropertyOptional({
    description:
      'Only listings open at the moment of the request, in Adelaide time (SRS DIR 008). Conditional: ignored while published hours coverage is below the threshold, which `meta.openNow.available` reports. Listings without published hours are never included — an absent schedule is not evidence of being open.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : value === true || value === 'true' || value === '1'))
  @IsBoolean()
  openNow?: boolean;

  @ApiPropertyOptional({ enum: SEARCH_SORTS, description: 'Defaults to relevance with q, otherwise name' }) @IsOptional() @IsIn(SEARCH_SORTS) sort?: SearchSort;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
}

export class PublicTermDto {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Services only: the icon key an editor chose, from the shared library' }) icon?: string | null;
}

export class PublicRatingDto {
  @ApiProperty({ description: 'Average of approved reviews, one decimal' }) average!: number;
  @ApiProperty() count!: number;
}

/** One bar of the rating histogram (SRS REV 004: approved reviews only). */
export class PublicRatingBucketDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) stars!: number;
  @ApiProperty({ description: 'Approved reviews with this rating' }) count!: number;
}

export class PublicImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
}

export class PublicImageVariantDto {
  @ApiProperty({ enum: ['thumbnail', 'card', 'hero'] }) kind!: 'thumbnail' | 'card' | 'hero';
  @ApiProperty() url!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class PublicBusinessCardDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: PublicTermDto }) primaryCategory!: PublicTermDto;
  @ApiProperty({ type: PublicTermDto }) localArea!: PublicTermDto;
  @ApiProperty({ type: PublicRatingDto, nullable: true, description: 'null until the first approved review ("No reviews yet")' }) rating!: PublicRatingDto | null;
  @ApiProperty({ type: PublicImageDto, nullable: true, description: 'Cover image; null when the listing has no published image, so clients render the fallback' }) image!: PublicImageDto | null;
}

export class PublicPhoneDto {
  @ApiProperty() display!: string;
  @ApiProperty() telHref!: string;
}

export class PublicContactDto {
  @ApiProperty({ type: PublicPhoneDto, nullable: true }) phone!: PublicPhoneDto | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) website!: string | null;
}

export class PublicAddressDto {
  @ApiProperty() line1!: string;
  @ApiProperty({ type: String, nullable: true }) line2!: string | null;
  @ApiProperty() suburb!: string;
  @ApiProperty() postcode!: string;
  @ApiProperty({ type: Number, nullable: true }) latitude!: number | null;
  @ApiProperty({ type: Number, nullable: true }) longitude!: number | null;
  @ApiProperty({ description: 'Directions link built from validated coordinates, else the address text (SRS BUS 003)' }) directionsUrl!: string;
}

export class PublicHoursDto {
  @ApiProperty({ enum: ['unknown', 'scheduled'] }) mode!: 'unknown' | 'scheduled';
  @ApiProperty({ type: WeeklyHoursDto }) weekly!: WeeklyHoursDto;
  @ApiProperty({ type: [HoursExceptionDto], description: 'Exceptions from today onwards' }) exceptions!: HoursExceptionDto[];
  @ApiProperty({ type: HoursStatusDto }) status!: HoursStatusDto;
  @ApiProperty({ format: 'date-time' }) evaluatedAt!: string;
}

export class PublicGalleryImageDto {
  @ApiProperty() alt!: string;
  @ApiProperty({ type: String, nullable: true }) caption!: string | null;
  @ApiProperty() isCover!: boolean;
  @ApiProperty({ type: [PublicImageVariantDto] }) variants!: PublicImageVariantDto[];
}

/** An image with its dimensions, as social platforms want it. */
export class PublicShareImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class PublicBusinessDetailDto extends PublicBusinessCardDto {
  @ApiProperty() description!: string;
  @ApiProperty({ type: Number, nullable: true, description: 'The year the business says it began trading; null when not recorded' }) establishedYear!: number | null;
  @ApiProperty({ type: String, nullable: true, description: 'Search-result title set by an editor; null means the page composes one' }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Meta description set by an editor; null means the description is used' }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Comma-separated keywords' }) seoKeywords!: string | null;
  @ApiProperty({ type: PublicShareImageDto, nullable: true, description: 'Image used when the listing is shared; null means the cover photograph is used' }) shareImage!: PublicShareImageDto | null;
  @ApiProperty({ type: [PublicTermDto] }) secondaryCategories!: PublicTermDto[];
  @ApiProperty({ type: [PublicTermDto] }) services!: PublicTermDto[];
  @ApiProperty({ type: PublicContactDto }) contact!: PublicContactDto;
  @ApiProperty({ type: [BusinessLinkDto] }) links!: BusinessLinkDto[];
  @ApiProperty({ enum: ['full', 'areaOnly'] }) addressVisibility!: 'full' | 'areaOnly';
  @ApiProperty({ type: PublicAddressDto, nullable: true, description: 'null when the business shows its local area only' }) address!: PublicAddressDto | null;
  @ApiProperty({ type: PublicHoursDto }) hours!: PublicHoursDto;
  @ApiProperty({ format: 'date-time' }) firstPublishedAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [PublicGalleryImageDto], description: 'Published gallery images, cover first (SRS MED 004)' }) gallery!: PublicGalleryImageDto[];
  @ApiProperty({ description: 'Whether the listing has a routable enquiry recipient (SRS ENQ 002); the form is hidden when false' }) acceptsEnquiries!: boolean;
  @ApiProperty({
    type: [PublicRatingBucketDto],
    description: 'Approved-review counts from five stars down to one; empty when the listing has no approved reviews. Every bucket is present, including zeros, so clients never infer a distribution from a page of reviews.',
  })
  ratingBreakdown!: PublicRatingBucketDto[];
  @ApiProperty({ type: [PublicBusinessCardDto], description: 'Up to four related published businesses (SRS BUS 005); empty when none' }) related!: PublicBusinessCardDto[];
}

export class SearchFacetDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() count!: number;
}

export class SearchFacetsDto {
  @ApiProperty({ type: [SearchFacetDto] }) categories!: SearchFacetDto[];
  @ApiProperty({ type: [SearchFacetDto] }) areas!: SearchFacetDto[];
}

/** Whether the "open now" filter can be offered, and the coverage behind that (SRS DIR 008). */
export class OpenNowMetaDto {
  @ApiProperty({ description: 'True when published hours coverage supports the filter; false means it is not offered and is ignored if sent' }) available!: boolean;
  @ApiProperty({ description: 'Whether this response was filtered to listings open now' }) applied!: boolean;
  @ApiProperty({ description: 'Published listings that publish a schedule' }) withHours!: number;
  @ApiProperty({ description: 'Published listings in total' }) published!: number;
}

export class SearchMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty() pageCount!: number;
  @ApiProperty({ enum: SEARCH_SORTS }) sort!: SearchSort;
  @ApiProperty({ type: SearchFacetsDto }) facets!: SearchFacetsDto;
  @ApiProperty({ type: [PublicBusinessCardDto], description: 'Featured block (SRS DIR 007): at most three, excluded from data, counts and pagination' }) featured!: PublicBusinessCardDto[];
  @ApiProperty({ type: OpenNowMetaDto, description: 'Conditional "open now" filter state (SRS DIR 008)' }) openNow!: OpenNowMetaDto;
}

export class SuggestionsQueryDto {
  @ApiProperty({ minLength: 2, maxLength: MAX_QUERY_LENGTH, description: 'At least two characters; shorter queries return empty groups' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value))
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  q!: string;
}

export class SuggestionDto {
  @ApiProperty({ enum: ['category', 'service', 'business'] }) kind!: 'category' | 'service' | 'business';
  @ApiProperty() label!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) hint!: string | null;
}

export class SuggestionsDto {
  @ApiProperty({ type: [SuggestionDto] }) categories!: SuggestionDto[];
  @ApiProperty({ type: [SuggestionDto] }) services!: SuggestionDto[];
  @ApiProperty({ type: [SuggestionDto] }) businesses!: SuggestionDto[];
}
