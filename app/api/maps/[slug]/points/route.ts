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
          mp.gps_lat,
          mp.gps_lon,
          mp.date_taken,
          mi.id AS invite_id,
          mi.label AS invite_label,
          mi.color AS invite_color,
          mp.object_key,
          mp.thumbnail_key
        FROM map_photos mp
        LEFT JOIN map_invites mi ON mi.id = mp.invite_id
        WHERE mp.map_id = ?
          AND mp.gps_lat IS NOT NULL
          AND mp.gps_lon IS NOT NULL
      `,
      args: [mapId],
    });

    const points = result.rows.map((row) => {
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
        latitude: Number(row.gps_lat),
        longitude: Number(row.gps_lon),
        dateTaken: row.date_taken ? String(row.date_taken) : null,
        invite: row.invite_id
          ? {
              id: String(row.invite_id),
              label: row.invite_label ? String(row.invite_label) : null,
              color: row.invite_color ? String(row.invite_color) : null,
            }
          : null,
        originalUrl,
        thumbnailUrl,
      };
    });

    return NextResponse.json(points);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load points' },
      { status: 500 },
    );
  }
}
