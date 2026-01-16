import { randomUUID } from 'crypto';
import path from 'path';
import * as exifr from 'exifr';
import { ensureSchema, getDbClient } from './db';
import {
  getObjectBuffer,
  getStorageConfig,
  isSupportedPhotoKey,
  listPhotoObjects,
} from './storage';

export type SyncResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

const DEFAULT_SOURCE_ID = 'default-source';

export async function syncPhotos(limit?: number): Promise<SyncResult> {
  const config = getStorageConfig();
  const db = getDbClient();
  await ensureSchema(db);

  const sourceId = process.env.PHOTO_SOURCE_ID || DEFAULT_SOURCE_ID;
  const sourceLabel = process.env.PHOTO_SOURCE_LABEL || 'Object storage';

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO photo_sources (id, type, label, config_json)
      VALUES (?, 'object_storage', ?, ?)
    `,
    args: [
      sourceId,
      sourceLabel,
      JSON.stringify({
        bucket: config.bucket,
        prefix: config.photoPrefix,
        thumbnailPrefix: config.thumbnailPrefix,
      }),
    ],
  });

  const existingRows = await db.execute({
    sql: 'SELECT object_key FROM photos WHERE source_id = ?',
    args: [sourceId],
  });

  const existingKeys = new Set<string>();
  for (const row of existingRows.rows) {
    if (row.object_key) {
      existingKeys.add(String(row.object_key));
    }
  }

  const allKeys = await listPhotoObjects(config);
  const filteredKeys = allKeys.filter((key) => isSupportedPhotoKey(key));

  const result: SyncResult = { imported: 0, skipped: 0, errors: [] };
  const envLimit = Number(process.env.SYNC_LIMIT || 0);
  const maxToProcess = limit ?? (envLimit || filteredKeys.length);
  let processed = 0;

  for (const key of filteredKeys) {
    if (processed >= maxToProcess) {
      break;
    }

    processed += 1;

    if (existingKeys.has(key)) {
      result.skipped += 1;
      continue;
    }

    try {
      const { buffer } = await getObjectBuffer(config, key);
      const exif = await exifr.parse(buffer, { tiff: true, exif: true });
      const gps = await exifr.gps(buffer).catch(() => null);

      const latitude = gps?.latitude ?? null;
      const longitude = gps?.longitude ?? null;
      const altitude = (gps as { altitude?: number } | null)?.altitude ?? null;
      const hasGps = latitude !== null && longitude !== null;

      const filename = path.basename(key);
      const thumbnailKey = config.thumbnailPrefix ? `${config.thumbnailPrefix}${filename}` : null;
      const dateTakenRaw = exif?.DateTimeOriginal ?? exif?.DateTime ?? null;
      const dateTaken = dateTakenRaw instanceof Date
        ? dateTakenRaw.toISOString()
        : dateTakenRaw
          ? String(dateTakenRaw)
          : null;

      await db.execute({
        sql: `
          INSERT INTO photos (
            id,
            source_id,
            object_key,
            thumbnail_key,
            filename,
            has_gps,
            gps_lat,
            gps_lon,
            gps_alt,
            camera_make,
            camera_model,
            date_taken,
            width,
            height
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          randomUUID(),
          sourceId,
          key,
          thumbnailKey,
          filename,
          hasGps ? 1 : 0,
          latitude,
          longitude,
          altitude,
          exif?.Make ?? null,
          exif?.Model ?? null,
          dateTaken,
          normalizeNumber(exif?.ExifImageWidth ?? exif?.ImageWidth),
          normalizeNumber(exif?.ExifImageHeight ?? exif?.ImageHeight),
        ],
      });

      result.imported += 1;
    } catch (error) {
      result.errors.push(`Failed to import ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return result;
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
