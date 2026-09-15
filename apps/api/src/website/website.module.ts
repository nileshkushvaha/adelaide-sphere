import { Module } from '@nestjs/common';
import { AlertAdminController, AlertPublicController } from './alert.controller.js';
import { AlertService } from './alert.service.js';
import { FaqAdminController, FaqPublicController } from './faq.controller.js';
import { FaqService } from './faq.service.js';
import { EditorLinkSourcesController, MenuAdminController, MenuPublicController } from './menu.controller.js';
import { MenuLinkSourcesService } from './menu-link-sources.service.js';
import { MenuService } from './menu.service.js';
import { MediaModule } from '../media/media.module.js';
import { PartnerService } from './partner.service.js';
import { TestimonialService } from './testimonial.service.js';
import { PartnerAdminController, PartnerPublicController, TestimonialAdminController, TestimonialPublicController } from './showcase.controller.js';

/**
 * Website content modules (SRS 1.2 section 26): frequently asked questions,
 * service alerts, testimonials, client/partner logos and navigation menus. They are public
 * marketing and support content — none of them grants access to anything.
 */
@Module({
  imports: [MediaModule],
  controllers: [FaqPublicController, FaqAdminController, AlertPublicController, AlertAdminController, TestimonialPublicController, TestimonialAdminController, PartnerPublicController, PartnerAdminController, MenuPublicController, MenuAdminController, EditorLinkSourcesController],
  providers: [FaqService, AlertService, TestimonialService, PartnerService, MenuService, MenuLinkSourcesService],
  exports: [FaqService, AlertService, TestimonialService, PartnerService],
})
export class WebsiteModule {}
