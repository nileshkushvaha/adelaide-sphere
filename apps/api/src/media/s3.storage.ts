import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateBucketCommand, DeleteObjectCommand, GetBucketPolicyCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutBucketPolicyCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { ObjectStoragePort, type PresignedUpload, type StoredObject } from './storage.port.js';

const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * S3-compatible storage (MinIO locally, a provider bucket in production). The
 * quarantine bucket is never public; only re-encoded variants are written to
 * the public bucket (SRS MED 002).
 */
@Injectable()
export class S3ObjectStorage extends ObjectStoragePort implements OnApplicationBootstrap {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly client: S3Client;
  private readonly buckets: { quarantine: string; public: string };
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    const endpoint = config.get('MEDIA_S3_ENDPOINT', { infer: true });
    this.client = new S3Client({
      region: config.get('MEDIA_S3_REGION', { infer: true }),
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId: config.get('MEDIA_S3_ACCESS_KEY_ID', { infer: true }) ?? '', secretAccessKey: config.get('MEDIA_S3_SECRET_ACCESS_KEY', { infer: true }) ?? '' },
    });
    this.buckets = { quarantine: config.get('MEDIA_QUARANTINE_BUCKET', { infer: true }), public: config.get('MEDIA_PUBLIC_BUCKET', { infer: true }) };
    this.publicBaseUrl = (config.get('MEDIA_PUBLIC_BASE_URL', { infer: true }) ?? `${endpoint ?? ''}/${this.buckets.public}`).replace(/\/+$/, '');
  }

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.ensureBuckets();
    } catch (error) {
      // Storage being down must not stop the API; media endpoints report it instead.
      this.logger.warn(`object storage unavailable at start-up: ${(error as Error).message}`);
    }
  }

  async ensureBuckets(): Promise<void> {
    for (const bucket of [this.buckets.quarantine, this.buckets.public]) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
        this.logger.log(`created bucket ${bucket}`);
      }
    }
    await this.ensurePublicReadPolicy();
  }

  /**
   * Published variants must be readable by browsers and the CDN; the quarantine
   * bucket never gets a policy (SRS MED 002). In production the bucket policy is
   * usually provisioned by infrastructure and the application key may not be
   * allowed to change it, so a failure here is logged, not fatal.
   */
  private async ensurePublicReadPolicy(): Promise<void> {
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Sid: 'PublicReadVariants', Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${this.buckets.public}/*`] }],
    });
    try {
      const existing = await this.client.send(new GetBucketPolicyCommand({ Bucket: this.buckets.public })).catch(() => null);
      if (existing?.Policy?.includes('PublicReadVariants')) return;
      await this.client.send(new PutBucketPolicyCommand({ Bucket: this.buckets.public, Policy: policy }));
      this.logger.log(`applied public read policy to ${this.buckets.public}`);
    } catch (error) {
      this.logger.warn(`could not set the public read policy on ${this.buckets.public}: ${(error as Error).message}`);
    }
  }

  async presignUpload(bucket: 'quarantine' | 'public', key: string, contentType: string, maxBytes: number): Promise<PresignedUpload> {
    const command = new PutObjectCommand({ Bucket: this.bucket(bucket), Key: key, ContentType: contentType, ContentLength: maxBytes });
    const url = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
    return { url, headers: { 'content-type': contentType, 'content-length': String(maxBytes) }, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
  }

  async head(bucket: 'quarantine' | 'public', key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket(bucket), Key: key }));
      return { bytes: Number(result.ContentLength ?? 0), contentType: result.ContentType ?? null };
    } catch {
      return null;
    }
  }

  async getBytes(bucket: 'quarantine' | 'public', key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(bucket), Key: key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async put(bucket: 'quarantine' | 'public', key: string, body: Buffer, contentType: string, options: { contentDisposition?: string } = {}): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket(bucket), Key: key, Body: body, ContentType: contentType, CacheControl: bucket === 'public' ? 'public, max-age=31536000, immutable' : 'no-store', ...(options.contentDisposition ? { ContentDisposition: options.contentDisposition } : {}) }),
    );
  }

  async delete(bucket: 'quarantine' | 'public', key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(bucket), Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  private bucket(name: 'quarantine' | 'public'): string {
    return name === 'quarantine' ? this.buckets.quarantine : this.buckets.public;
  }
}
