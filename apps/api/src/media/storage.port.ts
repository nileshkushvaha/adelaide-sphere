import { Injectable } from '@nestjs/common';

export interface PresignedUpload {
  url: string;
  /** Headers the client must send with the PUT so the signature matches. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface StoredObject {
  bytes: number;
  contentType: string | null;
}

/**
 * Object storage boundary (SRS ARC 003, MOD 002). The API never streams file
 * bytes through itself: it hands out a short-lived, constrained signed URL and
 * later reads the object back to validate it.
 */
@Injectable()
export abstract class ObjectStoragePort {
  /** A signed PUT for exactly this key, content type and size (SRS MED 002). */
  abstract presignUpload(bucket: 'quarantine' | 'public', key: string, contentType: string, maxBytes: number): Promise<PresignedUpload>;
  abstract head(bucket: 'quarantine' | 'public', key: string): Promise<StoredObject | null>;
  abstract getBytes(bucket: 'quarantine' | 'public', key: string): Promise<Buffer>;
  /** `contentDisposition` makes a published document download rather than render (change log 1.16). */
  abstract put(bucket: 'quarantine' | 'public', key: string, body: Buffer, contentType: string, options?: { contentDisposition?: string }): Promise<void>;
  abstract delete(bucket: 'quarantine' | 'public', key: string): Promise<void>;
  /** Public URL of a published object; quarantine objects have none. */
  abstract publicUrl(key: string): string;
  abstract ensureBuckets(): Promise<void>;
}
