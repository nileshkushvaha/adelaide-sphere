import { Global, Module } from '@nestjs/common';
import { SettingsStoreService } from './settings-store.service.js';

/**
 * The settings store on its own, global and importing nothing (SRS 1.2 SET 001).
 *
 * `SettingsModule` owns the settings *controllers*, so it imports `AuthModule`
 * for the guard chain; the enforcement points for security settings live inside
 * `AuthModule`. Keeping the store here breaks that circle rather than papering
 * over it with `forwardRef`, and every module that needs to read a setting can
 * inject it without importing anything.
 */
@Global()
@Module({ providers: [SettingsStoreService], exports: [SettingsStoreService] })
export class SettingsStoreModule {}
