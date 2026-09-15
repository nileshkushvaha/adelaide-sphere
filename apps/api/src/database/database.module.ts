import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

/**
 * Infrastructure boundary for MySQL access via @adelaide-sphere/database.
 * Global so domain modules inject DatabaseService without re-importing; they
 * must never import the generated Prisma client themselves.
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
