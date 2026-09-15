import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TaxonomyModule } from '../taxonomy/taxonomy.module.js';
import { DirectoryAdminController, FeaturedAdminController } from './directory-admin.controller.js';
import { DirectoryPublicController, SearchPublicController } from './directory-public.controller.js';
import { SearchService } from './search/search.service.js';
import { PublicRateLimitService } from './search/public-rate-limit.service.js';
import { SuggestionsService } from './search/suggestions.service.js';
import { DirectoryService } from './directory.service.js';
import { HoursService } from './hours/hours.service.js';
import { FeaturedService } from './featured.service.js';

@Module({ imports: [AuthModule, TaxonomyModule], controllers: [DirectoryAdminController, FeaturedAdminController, DirectoryPublicController, SearchPublicController], providers: [DirectoryService, HoursService, SearchService, SuggestionsService, PublicRateLimitService, FeaturedService], exports: [DirectoryService, SearchService, PublicRateLimitService, FeaturedService] })
export class DirectoryModule {}
