import { ApiProperty, ApiPropertyOptional, IntersectionType, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/pagination.js';
import { POST_STATES } from '../post-rules.js';
import type { BodyFormat } from '../sanitise.js';

export const BODY_FORMATS = ['html', 'markdown'] as const;
import { AUTHOR_LINK_KINDS, MAX_AUTHOR_LINKS, MAX_EXPERTISE, type AuthorLinkKind } from '../author-rules.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const emptyToNull = () => Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---- authors and editorial taxonomy -----------------------------------------

export class AuthorLinkDto {
  @ApiProperty({ enum: AUTHOR_LINK_KINDS }) @IsIn(AUTHOR_LINK_KINDS) kind!: AuthorLinkKind;
  @ApiProperty({ maxLength: 500 }) @trim() @IsString() @MaxLength(500) url!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(60) label?: string | null;
}

/**
 * Public author profile input (SRS BLOG 001/004). Everything except the display
 * name is optional, and none of it is credentials: authors never sign in.
 */
export class AuthorInputDto {
  @ApiProperty({ minLength: 2, maxLength: 120 }) @trim() @IsString() @Length(2, 120) displayName!: string;
  @ApiPropertyOptional({ maxLength: 100, description: 'Generated from the display name when omitted' }) @IsOptional() @trim() @IsString() @MaxLength(100) @Matches(SLUG, { message: 'slug must be lowercase words separated by hyphens' }) slug?: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120, description: 'Editorial role shown under the byline' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(120) role?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300, description: 'One or two sentences for author cards' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(300) shortBio?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 20000, description: 'Long profile text; sanitised with the editorial allowlist' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(20_000) bio?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 40 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(40) pronouns?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120, description: 'Adelaide suburb or area the author writes from' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(120) location?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255, description: 'Editorial contact address; never an administrator login' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) publicEmail?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(500) websiteUrl?: string | null;
  @ApiPropertyOptional({ type: [String], maxItems: MAX_EXPERTISE, description: 'Topic labels shown on author cards' }) @IsOptional() @IsArray() @ArrayMaxSize(MAX_EXPERTISE) @IsString({ each: true }) expertise?: string[];
  @ApiPropertyOptional({ type: [AuthorLinkDto], maxItems: MAX_AUTHOR_LINKS }) @IsOptional() @IsArray() @ArrayMaxSize(MAX_AUTHOR_LINKS) @ValidateNested({ each: true }) @Type(() => AuthorLinkDto) links?: AuthorLinkDto[];
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ready media asset used as the profile photo' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(64) imageMediaId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ready media asset used when the article is shared; falls back to the cover' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255, description: 'Comma-separated; recorded, not read by search engines' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 180 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
}

export class UpdateAuthorDto extends AuthorInputDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

export class AuthorImageDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
}

export class AuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) role!: string | null;
  @ApiProperty({ type: String, nullable: true }) shortBio!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Sanitised HTML' }) bio!: string | null;
  @ApiProperty({ type: String, nullable: true }) pronouns!: string | null;
  @ApiProperty({ type: String, nullable: true }) location!: string | null;
  @ApiProperty({ type: String, nullable: true }) publicEmail!: string | null;
  @ApiProperty({ type: String, nullable: true }) websiteUrl!: string | null;
  @ApiProperty({ type: [String] }) expertise!: string[];
  @ApiProperty({ type: [AuthorLinkDto] }) links!: { kind: AuthorLinkKind; url: string; label: string | null }[];
  @ApiProperty({ type: AuthorImageDto, nullable: true }) image!: { id: string; url: string; alt: string } | null;
  @ApiProperty({ type: String, nullable: true }) imageMediaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() postCount!: number;
  @ApiProperty({ description: 'Published articles credited to this author' }) publishedPostCount!: number;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class BlogTermInputDto {
  @ApiProperty({ minLength: 2, maxLength: 80 }) @trim() @IsString() @Length(2, 80) name!: string;
  @ApiPropertyOptional({ maxLength: 100 }) @IsOptional() @trim() @IsString() @MaxLength(100) @Matches(SLUG, { message: 'slug must be lowercase words separated by hyphens' }) slug?: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000, description: 'Editorial landing content (Markdown); a tag without it is noindex (SRS BLOG 005)' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(5000) landingContent?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 180, nullable: true, description: 'Search-result title; the composed one is used when empty' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 300, nullable: true, description: 'Meta description; the composed one is used when empty' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true, description: 'Comma-separated keywords' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 64, nullable: true, description: 'A processed media asset used when the landing page is shared' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
}

export class UpdateBlogTermDto extends BlogTermInputDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

/**
 * Narrowing for the category and tag lists. Both are small sets today, but tags
 * grow with the writing, and a screen that can only show all of them stops
 * being usable at exactly the point it matters.
 */
export class ListBlogTermsQueryDto {
  @ApiPropertyOptional({ maxLength: 80, description: 'Matches name and slug' }) @IsOptional() @trim() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}

/** Narrowing for the author list, matching the blog term lists. */
export class ListAuthorsQueryDto {
  @ApiPropertyOptional({ maxLength: 120, description: 'Matches display name and role' }) @IsOptional() @trim() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}

export class BlogTermStateDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

/** A preview of a chosen image, so the editor can show what is selected. */
export class BlogTermImageDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
}

export class BlogTermDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Sanitised HTML rendered on the landing page' }) landingContent!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Search-result title, when set' }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: String, nullable: true }) ogImageMediaId!: string | null;
  @ApiProperty({ type: BlogTermImageDto, nullable: true, description: 'The share image, for the editor preview' }) ogImage!: BlogTermImageDto | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() postCount!: number;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

// ---- posts -------------------------------------------------------------------

export class PostFieldsDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 180 }) @IsOptional() @trim() @IsString() @Length(3, 180) title?: string;
  @ApiPropertyOptional({ maxLength: 160, description: 'Generated from the title on create; locked after first publication' }) @IsOptional() @trim() @IsString() @MaxLength(160) @Matches(SLUG, { message: 'slug must be lowercase words separated by hyphens' }) slug?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @trim() @IsString() @MaxLength(500) excerpt?: string;
  @ApiPropertyOptional({ maxLength: 200_000, description: 'Article source in the chosen format; the server stores the sanitised HTML alongside it' }) @IsOptional() @IsString() @MaxLength(200_000) bodyMarkdown?: string;
  @ApiPropertyOptional({ enum: BODY_FORMATS, default: 'markdown', description: 'How to interpret the body: rich-editor HTML, or Markdown (the default)' }) @IsOptional() @IsIn(BODY_FORMATS) bodyFormat?: BodyFormat;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) authorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) categoryId?: string;
  @ApiPropertyOptional({ type: [String], maxItems: 10 }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) tagIds?: string[];
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) coverAlt?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ready media asset used as the article cover' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(64) coverMediaId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ready media asset used when the article is shared; falls back to the cover' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255, description: 'Comma-separated; recorded, not read by search engines' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 180 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ description: 'Whether visitors may comment (SRS COM 002)' }) @IsOptional() @IsBoolean() commentsEnabled?: boolean;
  @ApiPropertyOptional({ description: 'A paid guest post: labelled on the site and its links marked sponsored (SRS 1.12)' }) @IsOptional() @IsBoolean() guestPost?: boolean;
}

class RequiredPostFieldsDto {
  @ApiProperty({ minLength: 3, maxLength: 180 }) @trim() @IsString() @Length(3, 180) title!: string;
  @ApiProperty() @IsString() @MaxLength(64) authorId!: string;
  @ApiProperty() @IsString() @MaxLength(64) categoryId!: string;
}

export class CreatePostDto extends IntersectionType(RequiredPostFieldsDto, OmitType(PostFieldsDto, ['title', 'authorId', 'categoryId'] as const)) {}

export class UpdatePostDto extends PostFieldsDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500, description: 'Why the article changed; stored with the revision' }) @IsOptional() @trim() @IsString() @MaxLength(500) revisionReason?: string;
}

export class PostStateDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

export class SchedulePostDto extends PostStateDto {
  @ApiProperty({ format: 'date-time', description: 'UTC instant; the admin picks Australia/Adelaide time (SRS BLOG 002)' }) @IsDateString() scheduledAt!: string;
}

export class PostSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: POST_STATES }) status!: (typeof POST_STATES)[number];
  @ApiProperty() authorId!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() categoryName!: string;
  @ApiProperty({ type: [String] }) tagIds!: string[];
  @ApiProperty() commentsEnabled!: boolean;
  @ApiProperty({ description: 'A paid guest post (SRS 1.12)' }) guestPost!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) scheduledAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) firstPublishedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'When the article was featured on the home page and blog index, or null (SRS 1.10 BLOG 005)' }) featuredAt!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Why the scheduled publication was refused at its time; the article went back to draft' }) publishFailure!: string | null;
  @ApiProperty({ type: [String], description: 'Unmet publication requirements (SRS BLOG 002)' }) publicationBlockers!: string[];
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PostCoverDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
}

export class PostDto extends PostSummaryDto {
  @ApiProperty() excerpt!: string;
  @ApiProperty({ description: 'Source exactly as the author wrote it, in bodyFormat' }) bodyMarkdown!: string;
  @ApiProperty({ enum: BODY_FORMATS }) bodyFormat!: BodyFormat;
  @ApiProperty({ description: 'Sanitised HTML actually rendered (SRS SEC 001)' }) sanitizedBody!: string;
  @ApiProperty({ type: String, nullable: true }) coverAlt!: string | null;
  @ApiProperty({ type: String, nullable: true }) coverMediaId!: string | null;
  @ApiProperty({ type: PostCoverDto, nullable: true, description: 'Published cover rendition, or null while none is processed' }) cover!: { id: string; url: string; alt: string } | null;
  @ApiProperty({ type: String, nullable: true }) ogImageMediaId!: string | null;
  @ApiProperty({ type: PostCoverDto, nullable: true, description: 'Published share image, or null when the cover is used instead' }) ogImage!: { id: string; url: string; alt: string } | null;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) archivedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ListPostsQueryDto {
  @ApiPropertyOptional({ enum: POST_STATES }) @IsOptional() @IsIn(POST_STATES) status?: (typeof POST_STATES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) tagId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) authorId?: string;
  @ApiPropertyOptional({ maxLength: 120, description: 'Matches title and slug' }) @IsOptional() @trim() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional({ enum: ['updatedAt', 'publishedAt', 'scheduledAt', 'title'], default: 'updatedAt' }) @IsOptional() @IsIn(['updatedAt', 'publishedAt', 'scheduledAt', 'title']) sort: 'updatedAt' | 'publishedAt' | 'scheduledAt' | 'title' = 'updatedAt';
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' }) @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
}

export class PostRevisionDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorAdminId!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PostPreviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() excerpt!: string;
  @ApiProperty({ description: 'Sanitised HTML' }) sanitizedBody!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() categoryName!: string;
  @ApiProperty({ enum: POST_STATES }) status!: (typeof POST_STATES)[number];
  @ApiProperty({ description: 'Always true: previews are never indexable (SRS BLOG 003)' }) noindex!: boolean;
}
