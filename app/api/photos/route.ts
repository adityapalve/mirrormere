import { NextResponse } from 'next/server';
import { ensureSchema, getDbClient } from '@/lib/db';
import { buildPublicUrl, getStorageConfig } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = getDbClient();
    await ensureSchema(db);

    const storageConfig = getStorageConfig();
    const result = await db.execute({
      sql: `
        SELECT
          id,
          filename,
          object_key,
          thumbnail_key,
          has_gps,
          gps_lat,
          gps_lon,
          gps_alt,
          camera_make,
          camera_model,
          date_taken,
          width,
          height
        FROM photos
        ORDER BY date_taken DESC
      `,
    });

    const photos = result.rows.map((row) => {
      const id = String(row.id);
      const objectKey = String(row.object_key);
      const thumbnailKey = row.thumbnail_key ? String(row.thumbnail_key) : null;

      const originalUrl = storageConfig.publicBaseUrl
        ? buildPublicUrl(storageConfig, objectKey)
        : `/api/photos/${id}?type=original`;

      const thumbnailUrl = thumbnailKey
        ? storageConfig.publicBaseUrl
          ? buildPublicUrl(storageConfig, thumbnailKey)
          : `/api/photos/${id}?type=thumbnail`
        : originalUrl;

      return {
        id,
        filename: row.filename ? String(row.filename) : objectKey,
        original_url: originalUrl,
        thumbnail_url: thumbnailUrl,
        has_gps: Number(row.has_gps) === 1,
        gps: row.gps_lat !== null && row.gps_lon !== null
          ? {
              latitude: Number(row.gps_lat),
              longitude: Number(row.gps_lon),
              altitude: row.gps_alt !== null ? Number(row.gps_alt) : null,
            }
          : null,
        camera_make: row.camera_make ? String(row.camera_make) : 'Unknown',
        camera_model: row.camera_model ? String(row.camera_model) : 'Unknown',
        date_taken: row.date_taken ? String(row.date_taken) : 'Unknown',
        width: row.width ?? 'Unknown',
        height: row.height ?? 'Unknown',
      };
    });

    return NextResponse.json(photos);
  } catch (error) {
    console.error('Error reading photo metadata:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load photo metadata' },
      { status: 500 }
    );
  }
}
