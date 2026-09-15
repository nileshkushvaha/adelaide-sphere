import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, CurrentSession, RequirePermissions, RequireAnyPermission, type AuthenticatedRequest } from '../auth/decorators.js';
import type { SessionSummary } from '../auth/session.service.js';
import { PostPreviewLinkDto, RenderPostPreviewDto, RenderedPostPreviewDto } from './dto/post-preview.dto.js';
import { PostAutosaveDto, PostAutosaveReceiptDto, PostRevisionDetailDto, RestorePostRevisionDto, SavePostAutosaveDto } from './dto/post-history.dto.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { BlogService } from './blog.service.js';
import { DefaultAuthorDto, SetDefaultAuthorDto } from './dto/default-author.dto.js';
import { ChangeSlugDto } from '../seo/dto/redirect.dto.js';
import {
  AuthorDto,
  AuthorInputDto,
  BlogTermDto,
  BlogTermInputDto,
  BlogTermStateDto,
  CreatePostDto,
  ListPostsQueryDto,
  PostDto,
  PostPreviewDto,
  PostRevisionDto,
  PostStateDto,
  PostSummaryDto,
  SchedulePostDto,
  UpdateAuthorDto,
  UpdateBlogTermDto,
  ListBlogTermsQueryDto,
  ListAuthorsQueryDto,
  UpdatePostDto,
} from './dto/blog.dto.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/** Public author attribution management (SRS BLOG 001). */
@ApiTags('admin-blog')
@Controller('admin/authors')
export class AuthorsAdminController {
  constructor(private readonly blog: BlogService) {}

  @RequireAnyPermission('authors.view', 'posts.view', 'posts.create', 'posts.update')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [AuthorDto] })
  async list(@Query() query: ListAuthorsQueryDto) {
    return { data: await this.blog.listAuthors(query) };
  }

  // Declared before `:id`, so "mine" is never read as an author id.
  @RequireAnyPermission('posts.create', 'posts.update')
  @Get('mine')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'The signed-in administrator’s default author for new articles' })
  @ApiOkResponse({ type: DefaultAuthorDto })
  async mine(@CurrentAdmin() actor: AdminPrincipal) {
    return { data: await this.blog.getDefaultAuthor(actor) };
  }

  @RequireAnyPermission('posts.create', 'posts.update')
  @Put('mine')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Choose, or clear, the signed-in administrator’s default author' })
  @ApiOkResponse({ type: DefaultAuthorDto })
  async setMine(@Body() body: SetDefaultAuthorDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setDefaultAuthor(body.authorId ?? null, actor, ctxOf(req)) };
  }

  @RequirePermissions('authors.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'One author profile with links, photo and counts' })
  @ApiOkResponse({ type: AuthorDto })
  async getAuthor(@Param('id') id: string) {
    return { data: await this.blog.getAuthor(id) };
  }

  @RequirePermissions('authors.create')
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AuthorDto })
  async create(@Body() body: AuthorInputDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.createAuthor(body, actor, ctxOf(req)) };
  }

  @RequirePermissions('authors.update')
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AuthorDto })
  async update(@Param('id') id: string, @Body() body: UpdateAuthorDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.updateAuthor(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('authors.update')
  @Post(':id/activate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async activate(@Param('id') id: string, @Body() body: BlogTermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setAuthorActive(id, true, body.expectedVersion, actor, ctxOf(req)) };
  }

  @RequirePermissions('authors.update')
  @Post(':id/deactivate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async deactivate(@Param('id') id: string, @Body() body: BlogTermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setAuthorActive(id, false, body.expectedVersion, actor, ctxOf(req)) };
  }
}

/** Editorial categories (SRS BLOG 005). */
@ApiTags('admin-blog')
@Controller('admin/blog-categories')
export class BlogCategoriesAdminController {
  constructor(private readonly blog: BlogService) {}

  @RequireAnyPermission('blog_categories.view', 'posts.view', 'posts.create', 'posts.update')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [BlogTermDto] })
  async list(@Query() query: ListBlogTermsQueryDto) {
    return { data: await this.blog.listTerms('category', query) };
  }

  @RequirePermissions('blog_categories.create')
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async create(@Body() body: BlogTermInputDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.createTerm('category', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('blog_categories.update')
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  async update(@Param('id') id: string, @Body() body: UpdateBlogTermDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.updateTerm('category', id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('blog_categories.update')
  @Post(':id/activate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async activate(@Param('id') id: string, @Body() body: BlogTermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setTermActive('category', id, true, body.expectedVersion, actor, ctxOf(req)) };
  }

  @RequirePermissions('blog_categories.update')
  @Post(':id/deactivate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async deactivate(@Param('id') id: string, @Body() body: BlogTermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setTermActive('category', id, false, body.expectedVersion, actor, ctxOf(req)) };
  }
}

/** Editorial tags (SRS BLOG 005). */
@ApiTags('admin-blog')
@Controller('admin/blog-tags')
export class BlogTagsAdminController {
  constructor(private readonly blog: BlogService) {}

  @RequireAnyPermission('blog_tags.view', 'posts.view', 'posts.create', 'posts.update')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [BlogTermDto] })
  async list(@Query() query: ListBlogTermsQueryDto) {
    return { data: await this.blog.listTerms('tag', query) };
  }

  @RequirePermissions('blog_tags.create')
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async create(@Body() body: BlogTermInputDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.createTerm('tag', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('blog_tags.update')
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  async update(@Param('id') id: string, @Body() body: UpdateBlogTermDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.updateTerm('tag', id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('blog_tags.update')
  @Post(':id/activate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async activate(@Param('id') id: string, @Body() body: BlogTermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setTermActive('tag', id, true, body.expectedVersion, actor, ctxOf(req)) };
  }

  @RequirePermissions('blog_tags.update')
  @Post(':id/deactivate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async deactivate(@Param('id') id: string, @Body() body: BlogTermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setTermActive('tag', id, false, body.expectedVersion, actor, ctxOf(req)) };
  }
}

/** Articles (SRS BLOG 001–003). Publication needs `posts.publish`; editing needs `posts.write`. */
@ApiTags('admin-blog')
@Controller('admin/posts')
export class PostsAdminController {
  constructor(private readonly blog: BlogService) {}

  @RequirePermissions('posts.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List articles (status, category, tag, author, q, sort, order, page, pageSize)' })
  @ApiOkResponse({ type: [PostSummaryDto] })
  list(@Query() query: ListPostsQueryDto) {
    return this.blog.listPosts(query);
  }

  @RequirePermissions('posts.create')
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PostDto })
  async create(@Body() body: CreatePostDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.createPost(body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PostDto })
  async get(@Param('id') id: string) {
    return { data: await this.blog.getPost(id) };
  }

  @RequireAnyPermission('posts.create', 'posts.update')
  @Post('preview-render')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @ApiOperation({ summary: 'Render unsaved article content for the editor without storing it (SRS BLOG 003)' })
  @ApiOkResponse({ type: RenderedPostPreviewDto })
  async renderPreview(@Body() body: RenderPostPreviewDto) {
    return { data: await this.blog.renderPreview(body) };
  }

  @RequirePermissions('posts.view')
  @Post(':id/preview-link')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A private ten-minute link to see the saved article on the public site, bound to this session' })
  @ApiOkResponse({ type: PostPreviewLinkDto })
  async previewLink(@Param('id') id: string, @CurrentSession() session: SessionSummary) {
    return { data: await this.blog.createPreviewLink(id, session.id) };
  }

  @RequirePermissions('posts.view')
  @Get(':id/preview')
  @Header('Cache-Control', 'no-store, private')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @ApiOperation({ summary: 'Sanitised preview for authorised admins only; never public and never indexable (SRS BLOG 003)' })
  @ApiOkResponse({ type: PostPreviewDto })
  async preview(@Param('id') id: string) {
    return { data: await this.blog.preview(id) };
  }

  @RequirePermissions('posts.view')
  @Get(':id/revisions')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [PostRevisionDto] })
  async revisions(@Param('id') id: string) {
    return { data: await this.blog.revisions(id) };
  }

  @RequirePermissions('posts.view')
  @Get(':id/revisions/:revisionId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'One earlier version of the article, as written, for comparison' })
  @ApiOkResponse({ type: PostRevisionDetailDto })
  async revision(@Param('id') id: string, @Param('revisionId') revisionId: string) {
    return { data: await this.blog.revisionDetail(id, revisionId) };
  }

  @RequirePermissions('posts.update')
  @Post(':id/revisions/:revisionId/restore')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Bring back an earlier version; the current one is kept as a revision first (SRS BLOG 003)' })
  @ApiOkResponse({ type: PostDto })
  async restoreRevision(@Param('id') id: string, @Param('revisionId') revisionId: string, @Body() body: RestorePostRevisionDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.restoreRevision(id, revisionId, body.expectedVersion, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.update')
  @Get(':id/autosave')
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'The signed-in editor’s own unsaved work on this article, or null' })
  @ApiOkResponse({ type: PostAutosaveDto })
  async autosave(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal) {
    return { data: await this.blog.getAutosave(id, actor) };
  }

  @RequirePermissions('posts.update')
  @Put(':id/autosave')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Keep unsaved work while writing; never changes the article' })
  @ApiOkResponse({ type: PostAutosaveReceiptDto })
  async saveAutosave(@Param('id') id: string, @Body() body: SavePostAutosaveDto, @CurrentAdmin() actor: AdminPrincipal) {
    return { data: await this.blog.saveAutosave(id, body, actor) };
  }

  @RequirePermissions('posts.update')
  @Delete(':id/autosave')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async discardAutosave(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.blog.discardAutosave(id, actor, ctxOf(req));
  }

  @RequirePermissions('posts.update')
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PostDto })
  async update(@Param('id') id: string, @Body() body: UpdatePostDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.updatePost(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.publish')
  @Post(':id/slug')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Change the public slug; a published article keeps a 301 from the old path (SRS SEO 004)' })
  @ApiOkResponse({ type: PostDto })
  async changeSlug(@Param('id') id: string, @Body() body: ChangeSlugDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.changeSlug(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.publish')
  @Post(':id/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PostDto })
  async publish(@Param('id') id: string, @Body() body: PostStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.transition(id, 'publish', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.publish')
  @Post(':id/schedule')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Schedule publication at a UTC instant chosen as Adelaide time' })
  @ApiOkResponse({ type: PostDto })
  async schedule(@Param('id') id: string, @Body() body: SchedulePostDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.transition(id, 'schedule', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.publish')
  @Post(':id/unpublish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PostDto })
  async unpublish(@Param('id') id: string, @Body() body: PostStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.transition(id, 'unpublish', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.publish')
  @Post(':id/archive')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PostDto })
  async archive(@Param('id') id: string, @Body() body: PostStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.transition(id, 'archive', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.publish')
  @Post(':id/restore')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PostDto })
  async restore(@Param('id') id: string, @Body() body: PostStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.transition(id, 'restore', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.feature')
  @Post(':id/feature')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Feature a published article on the home page and blog index (at most three)' })
  @ApiOkResponse({ type: PostDto })
  async feature(@Param('id') id: string, @Body() body: PostStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setFeatured(id, true, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('posts.feature')
  @Post(':id/unfeature')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Stop featuring an article' })
  @ApiOkResponse({ type: PostDto })
  async unfeature(@Param('id') id: string, @Body() body: PostStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.blog.setFeatured(id, false, body, actor, ctxOf(req)) };
  }
}
