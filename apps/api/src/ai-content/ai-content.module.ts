import { Module } from '@nestjs/common';
import { AiContentController } from './ai-content.controller.js';
import { AiContentService } from './ai-content.service.js';
import { AiGenerationController } from './ai-generation.controller.js';
import { AiGenerationService } from './ai-generation.service.js';
import { AiResearchController } from './ai-research.controller.js';
import { AiResearchService } from './ai-research.service.js';
@Module({ controllers: [AiContentController, AiResearchController, AiGenerationController], providers: [AiContentService, AiResearchService, AiGenerationService] })
export class AiContentModule {}
