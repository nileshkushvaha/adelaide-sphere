import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { RequestContext } from '../auth/auth.service.js';
import { Public, type AuthenticatedRequest } from '../auth/decorators.js';
import { IDEMPOTENCY_HEADER, IdempotencyService } from '../common/idempotency.service.js';
import { getRequestId } from '../common/request-id.js';
import { CommentsService } from './comments.service.js';
import { CommentReceiptDto, ListPublicCommentsQueryDto, PublicCommentDto, SubmitCommentDto } from './dto/comment.dto.js';
import { ListPublicPostsQueryDto, PublicAuthorPageDto, PublicBlogTermDto, PublicPostCardDto, PublicPostDto } from './dto/public-post.dto.js';
import { BlogPublicService } from './blog-public.service.js';

const ctxOf = (req: Request): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req as AuthenticatedRequest) });

/** Public blog (SRS section 15 table). Published articles and approved comments only. */
@ApiTags('public-blog')
@Public()
@Controller()
export class BlogPublicController {
  constructor(
    private readonly blog: BlogPublicService,
    private readonly comments: CommentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('posts')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Published articles, newest first (category, tag, author, featured, q, page, pageSize)' })
  @ApiOkResponse({ type: [PublicPostCardDto] })
  list(@Query() query: ListPublicPostsQueryDto) {
    return this.blog.list(query);
  }

  @Get('blog-categories')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOkResponse({ type: [PublicBlogTermDto] })
  async categories() {
    return { data: await this.blog.terms('category') };
  }

  @Get('tags')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOkResponse({ type: [PublicBlogTermDto] })
  async tags() {
    return { data: await this.blog.terms('tag') };
  }

  @Get('authors/:slug')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'An author page: active authors with at least one published article only (404 otherwise)' })
  @ApiOkResponse({ type: PublicAuthorPageDto })
  async author(@Param('slug') slug: string) {
    return { data: await this.blog.author(slug) };
  }

  @Get('posts/:id/comments')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Approved comments, oldest first (SRS COM 002)' })
  @ApiOkResponse({ type: [PublicCommentDto] })
  comments_(@Param('id') id: string, @Query() query: ListPublicCommentsQueryDto) {
    return this.comments.publicList(id, query);
  }

  @Post('posts/:id/comments')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Submit a comment for moderation (Idempotency-Key required)' })
  @ApiOkResponse({ type: CommentReceiptDto })
  async submitComment(@Param('id') id: string, @Body() body: SubmitCommentDto, @Headers(IDEMPOTENCY_HEADER) key: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!key || key.trim().length < 8 || key.length > 200) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An Idempotency-Key header of 8–200 characters is required', fields: {} });
    }
    const scope = `comment:${id}`;
    const existing = await this.idempotency.lookup(scope, key, body);
    if (existing) {
      res.status(existing.status);
      res.setHeader('Idempotent-Replay', 'true');
      return existing.body;
    }
    const data = await this.comments.submit(id, body, ctxOf(req));
    const payload = { data } as Record<string, unknown>;
    await this.idempotency.remember(scope, key, body, { status: 201, body: payload });
    return payload;
  }

  @Get('preview/posts/:token')
  @Header('Cache-Control', 'no-store, private')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'A draft article behind a private preview link issued to a signed-in editor (SRS BLOG 003); 404 once expired' })
  @ApiOkResponse({ type: PublicPostDto })
  async previewPost(@Param('token') token: string) {
    return { data: await this.blog.previewByToken(token) };
  }

  @Get('posts/:slug')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Published article with related articles (404 for drafts)' })
  @ApiOkResponse({ type: PublicPostDto })
  async detail(@Param('slug') slug: string) {
    return { data: await this.blog.detail(slug) };
  }
}
