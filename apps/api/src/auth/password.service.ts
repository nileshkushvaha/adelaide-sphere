import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** `Algorithm.Argon2id` from @node-rs/argon2 is a const enum (unusable under isolatedModules); value 2 per its type definitions. */
const ARGON2ID = 2 as Algorithm;
import type { EnvironmentVariables } from '../config/env.validation.js';

/** Documented safe bound (SRS AUTH 001): long passphrases allowed, DoS-sized input rejected. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export interface Argon2Params {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

/**
 * Argon2id hashing (SRS AUTH 001). Parameters come from validated
 * configuration so deployments can raise them after benchmarking; hashes
 * embed their parameters, so verification of older hashes keeps working and
 * `needsRehash` reports when to upgrade on next successful login.
 */
@Injectable()
export class PasswordService {
  readonly params: Argon2Params;
  /** Hash of a random secret used to equalise timing when the account does not exist. */
  private dummyHash: Promise<string> | undefined;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.params = {
      memoryCost: config.get('ARGON2_MEMORY_KIB', { infer: true }),
      timeCost: config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: config.get('ARGON2_PARALLELISM', { infer: true }),
    };
  }

  /**
   * The baseline of AUTH 001. A deployment may require a longer password
   * through the security settings, never a shorter one — `validateWithPolicy`
   * is what callers inside the application use.
   */
  static validate(password: string, minLength: number = PASSWORD_MIN_LENGTH): string | null {
    const floor = Math.max(minLength, PASSWORD_MIN_LENGTH);
    if (typeof password !== 'string') return 'Password is required';
    if (password.length < floor) return `Password must be at least ${floor} characters`;
    if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
    return null;
  }

  hash(password: string): Promise<string> {
    return hash(password, { algorithm: ARGON2ID, ...this.params });
  }

  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password, { algorithm: ARGON2ID });
    } catch {
      return false;
    }
  }

  /** Burns comparable CPU when no account matches, so response time does not reveal existence. */
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash(`dummy-${Math.random()}-${Date.now()}`);
    await this.verify(await this.dummyHash, password);
  }

  /** True when the stored hash was produced with weaker parameters than configured. */
  needsRehash(storedHash: string): boolean {
    const m = /\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
    if (!m) return true;
    return Number(m[1]) < this.params.memoryCost || Number(m[2]) < this.params.timeCost || Number(m[3]) < this.params.parallelism;
  }
}
