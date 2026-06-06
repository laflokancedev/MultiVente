import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private client() {
    return new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY as string,
        secretAccessKey: process.env.S3_SECRET_KEY as string,
      },
    });
  }

  buildKey(userId: string, listingId: string, filename: string): string {
    const safe = filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    return `${userId}/${listingId}/${randomUUID()}-${safe}`;
  }

  publicUrl(key: string): string {
    return `${process.env.S3_PUBLIC_URL}/${key}`;
  }

  async presignUpload(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client(), command, { expiresIn: 900 });
  }
}
