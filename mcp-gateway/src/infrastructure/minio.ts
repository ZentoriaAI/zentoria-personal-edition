/**
 * MinIO S3-Compatible Storage Client
 */

import * as Minio from 'minio';
import { logger } from './logger.js';

export interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
}

export async function createMinioClient(): Promise<Minio.Client> {
  const config: MinioConfig = {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  };

  const client = new Minio.Client(config);

  // Verify connection and ensure bucket exists
  const bucket = process.env.MINIO_BUCKET || 'zentoria-files';

  try {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
      logger.info({ bucket }, 'Created MinIO bucket');
    } else {
      logger.info({ bucket }, 'MinIO bucket verified');
    }
  } catch (err) {
    logger.error({ err, bucket }, 'MinIO initialization failed');
    throw err;
  }

  return client;
}

/**
 * Generate a presigned URL for direct upload
 */
export async function getPresignedPutUrl(
  client: Minio.Client,
  bucket: string,
  objectName: string,
  expirySeconds = 3600
): Promise<string> {
  return client.presignedPutObject(bucket, objectName, expirySeconds);
}

/**
 * Generate a presigned URL for download
 */
export async function getPresignedGetUrl(
  client: Minio.Client,
  bucket: string,
  objectName: string,
  expirySeconds = 3600
): Promise<string> {
  return client.presignedGetObject(bucket, objectName, expirySeconds);
}

/**
 * Object path conventions
 */
export const MinioKeys = {
  userFile: (userId: string, fileId: string, filename: string) =>
    `users/${userId}/files/${fileId}/${filename}`,
  tempFile: (uploadId: string, filename: string) =>
    `temp/${uploadId}/${filename}`,
  thumbnail: (fileId: string) =>
    `thumbnails/${fileId}.jpg`,
} as const;
