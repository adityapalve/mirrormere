import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDbClient } from '@/lib/db';
import { buildPublicUrl, getStorageConfig } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const db = getDbClient();
    await ensureSchema(db);

    const mapResult = await db.execute({
      sql: 'SELECT id FROM maps WHERE slug = ? LIMIT 1',
      args: [slug],
    });

    if (mapResult.rows.length === 0) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 });
    }

    const mapId = String(mapResult.rows[0].id);
    const storageConfig = getStorageConfig();

    const result = await db.execute({
      sql: `
        SELECT
          mp.id,
          mp.filename,
          mp.object_key,
          mp.thumbnail_key,
          mp.has_gps,
          mp.gps_lat,
          mp.gps_lon,
          mp.gps_alt,
          mp.camera_make,
          mp.camera_model,
          mp.date_taken,
          mp.width,
          mp.height,
          mi.id AS invite_id,
          mi.label AS invite_label,
          mi.color AS invite_color
        FROM map_photos mp
        LEFT JOIN map_invites mi ON mi.id = mp.invite_id
        WHERE mp.map_id = ?
        ORDER BY mp.date_taken DESC, mp.created_at DESC
      `,
      args: [mapId],
    });

    const photos = result.rows.map((row) => {
      const id = String(row.id);
      const objectKey = String(row.object_key);
      const thumbKey = row.thumbnail_key ? String(row.thumbnail_key) : null;

      const originalUrl = storageConfig.publicBaseUrl
        ? buildPublicUrl(storageConfig, objectKey)
        : `/api/map-photos/${id}?type=original`;

      const thumbnailUrl = thumbKey
        ? storageConfig.publicBaseUrl
          ? buildPublicUrl(storageConfig, thumbKey)
          : `/api/map-photos/${id}?type=thumbnail`
        : originalUrl;

      return {
        id,
        filename: row.filename ? String(row.filename) : objectKey,
        originalUrl,
        thumbnailUrl,
        hasGps: Number(row.has_gps) === 1,
        gps: row.gps_lat !== null && row.gps_lon !== null
          ? {
              latitude: Number(row.gps_lat),
              longitude: Number(row.gps_lon),
              altitude: row.gps_alt !== null ? Number(row.gps_alt) : null,
            }
          : null,
        cameraMake: row.camera_make ? String(row.camera_make) : null,
        cameraModel: row.camera_model ? String(row.camera_model) : null,
        dateTaken: row.date_taken ? String(row.date_taken) : null,
        width: row.width !== null ? Number(row.width) : null,
        height: row.height !== null ? Number(row.height) : null,
        invite: row.invite_id
          ? {
              id: String(row.invite_id),
              label: row.invite_label ? String(row.invite_label) : null,
              color: row.invite_color ? String(row.invite_color) : null,
            }
          : null,
      };
    });

    return NextResponse.json(photos);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load photos' },
      { status: 500 },
    );
  }
}
