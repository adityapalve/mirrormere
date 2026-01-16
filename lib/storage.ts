import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export type StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  photoPrefix: string;
  thumbnailPrefix: string | null;
  publicBaseUrl?: string;
  forcePathStyle: boolean;
};

const DEFAULT_PHOTO_PREFIX = 'photos/';

export function getStorageConfig(): StorageConfig {
  const bucket = process.env.PHOTO_BUCKET;

  if (!bucket) {
    throw new Error('Missing PHOTO_BUCKET. Set it to your object storage bucket name.');
  }

  const photoPrefix = ensureTrailingSlash(process.env.PHOTO_PREFIX || DEFAULT_PHOTO_PREFIX);
  const thumbnailPrefix = process.env.THUMBNAIL_PREFIX
    ? ensureTrailingSlash(process.env.THUMBNAIL_PREFIX)
    : null;

  return {
    bucket,
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    photoPrefix,
    thumbnailPrefix,
    publicBaseUrl: process.env.PUBLIC_ASSET_BASE_URL,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

let s3Client: S3Client | null = null;

export function getS3Client(config: StorageConfig) {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined,
    });
  }

  return s3Client;
}

export async function listPhotoObjects(config: StorageConfig) {
  const client = getS3Client(config);
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const response: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.photoPrefix,
        ContinuationToken: continuationToken,
      })
    );

    response.Contents?.forEach((item) => {
      if (item.Key) {
        keys.push(item.Key);
      }
    });

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

export async function getObjectBuffer(config: StorageConfig, key: string) {
  const client = getS3Client(config);
  const response: GetObjectCommandOutput = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`Missing object body for ${key}`);
  }

  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return { buffer: Buffer.concat(chunks), contentType: response.ContentType };
}

export function buildPublicUrl(config: StorageConfig, key: string) {
  if (!config.publicBaseUrl) {
    return null;
  }

  const normalizedBase = config.publicBaseUrl.replace(/\/$/, '');
  return `${normalizedBase}/${key}`;
}

export function isSupportedPhotoKey(key: string) {
  const lower = key.toLowerCase();
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.heic');
}
