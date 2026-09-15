import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicCategoryDto, PublicLocalAreaDto } from './dto/taxonomy.dto.js';
import { TaxonomyService } from './taxonomy.service.js';

/** Public taxonomy (SRS API table: GET /categories /services /areas). Active items only. */
@ApiTags('public-taxonomy')
@Controller()
export class TaxonomyPublicController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get('categories')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Active categories as a two-level tree' })
  @ApiOkResponse({ type: [PublicCategoryDto] })
  async categories() {
    return { data: await this.taxonomy.publicCategoryTree() };
  }

  @Get('services')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Active services with search synonyms' })
  async services() {
    return { data: await this.taxonomy.publicServices() };
  }

  @Get('areas')
  @ApiOkResponse({ type: [PublicLocalAreaDto] })
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Approved, active Adelaide local areas' })
  async areas() {
    return { data: await this.taxonomy.publicAreas() };
  }
}
