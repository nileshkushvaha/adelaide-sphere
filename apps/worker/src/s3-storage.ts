import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { StorageAdapter } from './media-processing.js';

export interface S3StorageOptions {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  quarantineBucket: string;
  publicBucket: string;
}

/** The worker's half of the storage boundary; the API owns presigning. */
export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  private bucket(name: 'quarantine' | 'public'): string {
    return name === 'quarantine' ? this.options.quarantineBucket : this.options.publicBucket;
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
}
