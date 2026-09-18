import { Module } from '@nestjs/common';
import { AiContentController } from './ai-content.controller.js';
import { AiContentService } from './ai-content.service.js';
import { AiResearchController } from './ai-research.controller.js';
import { AiResearchService } from './ai-research.service.js';
@Module({ controllers: [AiContentController, AiResearchController], providers: [AiContentService, AiResearchService] })
export class AiContentModule {}
