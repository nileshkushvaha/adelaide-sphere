import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminsController } from './admins.controller.js';
import { AdminsService } from './admins.service.js';

@Module({ imports: [AuthorizationModule, AuthModule], controllers: [AdminsController], providers: [AdminsService], exports: [AdminsService] })
export class AdminsModule {}
