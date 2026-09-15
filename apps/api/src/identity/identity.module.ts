import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { IdentityService } from './identity.service.js';

@Module({ imports: [AuthorizationModule], providers: [IdentityService], exports: [IdentityService] })
export class IdentityModule {}
